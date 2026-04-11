import { NodeInfo, ListOption } from '../types';

export interface SwitchFieldConfig {
    checked: boolean;
    checkedLabel: string;
    checkedValue: string;
    uncheckedLabel: string;
    uncheckedValue: string;
}

const TRUE_HINTS = ['true', 'on', 'enable', 'enabled', 'open', 'yes', 'checked', '1', '开启', '打开', '启用', '是'];
const FALSE_HINTS = ['false', 'off', 'disable', 'disabled', 'close', 'closed', 'no', 'unchecked', '0', '关闭', '关', '禁用', '否'];
const TEXT_PRIORITY_KEYS = ['label', 'name', 'text', 'title', 'description', 'value', 'index', 'id', 'default'];

export const isSwitchField = (node: NodeInfo): boolean =>
    node.fieldType === 'SWITCH' || node.fieldType === 'BOOLEAN';

const sanitizeText = (value: string | null | undefined): string => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed === '[object Object]') {
        return '';
    }

    return trimmed;
};

const parseFieldData = (fieldData: NodeInfo['fieldData']) => {
    if (fieldData == null) {
        return null;
    }

    if (typeof fieldData === 'object') {
        return fieldData;
    }

    try {
        return JSON.parse(String(fieldData));
    } catch {
        return String(fieldData);
    }
};

const extractText = (value: any, visited = new Set<any>()): string => {
    if (value == null) {
        return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return sanitizeText(String(value));
    }

    if (typeof value !== 'object') {
        return '';
    }

    if (visited.has(value)) {
        return '';
    }
    visited.add(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            const text = extractText(item, visited);
            if (text) {
                return text;
            }
        }
        return '';
    }

    for (const key of TEXT_PRIORITY_KEYS) {
        if (key in value) {
            const text = extractText(value[key], visited);
            if (text) {
                return text;
            }
        }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        const text = extractText(nestedValue, visited);
        if (text) {
            return text;
        }

        const keyText = sanitizeText(key);
        if (keyText && keyText !== 'default') {
            return keyText;
        }
    }

    return '';
};

const toListOption = (item: any): ListOption | null => {
    if (item == null || Array.isArray(item)) {
        return null;
    }

    if (typeof item !== 'object') {
        const value = String(item).trim();
        return value ? { name: value, index: value } : null;
    }

    if (
        'default' in item
        && !('name' in item)
        && !('label' in item)
        && !('text' in item)
        && !('value' in item)
        && !('index' in item)
        && !('id' in item)
    ) {
        return null;
    }

    const entries = Object.entries(item);
    if (entries.length === 1) {
        const [singleKey, singleValue] = entries[0];
        if (singleValue && typeof singleValue === 'object' && !Array.isArray(singleValue)) {
            const name = extractText(singleValue) || sanitizeText(singleKey);
            const index = sanitizeText(singleKey) || extractText(singleValue);
            if (name && index) {
                return { name, index };
            }
        }
    }

    if ('name' in item) {
        const name = extractText(item.name);
        const description = extractText(item.description);
        const index = extractText(item.index) || name;
        if (!name || !index) {
            return null;
        }

        return {
            name: description ? `${name} - ${description}` : name,
            index,
        };
    }

    if ('label' in item) {
        const label = extractText(item.label);
        const index = extractText(item.value) || label;
        if (!label || !index) {
            return null;
        }

        return {
            name: label,
            index,
        };
    }

    if ('text' in item) {
        const text = extractText(item.text);
        const index = extractText(item.value) || extractText(item.id) || text;
        if (!text || !index) {
            return null;
        }

        return {
            name: text,
            index,
        };
    }

    if ('value' in item && 'index' in item) {
        const name = extractText(item.value);
        const index = extractText(item.index);
        if (!name || !index) {
            return null;
        }

        return {
            name,
            index,
        };
    }

    if ('value' in item) {
        const value = extractText(item.value);
        if (!value) {
            return null;
        }
        return { name: value, index: value };
    }

    if ('index' in item) {
        const index = extractText(item.index);
        if (!index) {
            return null;
        }
        return { name: index, index };
    }

    const values = Object.values(item)
        .filter(value => value != null && typeof value !== 'object')
        .map(value => String(value).trim())
        .filter(Boolean);

    if (values.length >= 2) {
        return { name: values[0], index: values[1] };
    }

    if (values.length === 1) {
        return { name: values[0], index: values[0] };
    }

    return null;
};

const booleanScore = (value: string): number => {
    const normalized = value.toLowerCase();

    if (FALSE_HINTS.some(keyword => normalized.includes(keyword))) {
        return -1;
    }

    if (TRUE_HINTS.some(keyword => normalized.includes(keyword))) {
        return 1;
    }

    return 0;
};

const inferBooleanValue = (value: string, checkedValue: string, uncheckedValue: string): boolean => {
    if (value === checkedValue) {
        return true;
    }

    if (value === uncheckedValue) {
        return false;
    }

    return booleanScore(value) > 0;
};

export const parseListOptions = (node: NodeInfo): ListOption[] => {
    const isListType = node.fieldType === 'LIST';
    const isSwitchWithData = isSwitchField(node) && !!node.fieldData;
    const isSelectField = node.fieldName === 'select' && !!node.fieldData;

    if (!isListType && !isSwitchWithData && !isSelectField) {
        return [];
    }

    const fallback = node.fieldValue ? [{ name: node.fieldValue, index: node.fieldValue }] : [];

    if (!node.fieldData) {
        return fallback;
    }

    try {
        const parsed = parseFieldData(node.fieldData);

        if (typeof parsed === 'string') {
            if (parsed.includes(',')) {
                const options = parsed
                    .split(',')
                    .map(part => part.trim())
                    .filter(Boolean)
                    .map(part => ({ name: part, index: part }));

                return options.length > 0 ? options : fallback;
            }

            return fallback;
        }

        if (Array.isArray(parsed)) {
            if (parsed.length > 0 && Array.isArray(parsed[0])) {
                const options = parsed[0]
                    .map(item => String(item).trim())
                    .filter(Boolean)
                    .map(item => ({ name: item, index: item }));

                return options.length > 0 ? options : fallback;
            }

            if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                const options = parsed
                    .map(toListOption)
                    .filter((item): item is ListOption => item !== null);

                return options.length > 0 ? options : fallback;
            }

            const options = parsed
                .map(item => String(item).trim())
                .filter(Boolean)
                .map(item => ({ name: item, index: item }));

            return options.length > 0 ? options : fallback;
        }
    } catch (error) {
        console.error('Error parsing list options:', error);
    }

    return fallback;
};

export const getSwitchFieldConfig = (node: NodeInfo): SwitchFieldConfig | null => {
    if (!isSwitchField(node)) {
        return null;
    }

    const options = parseListOptions(node);

    if (options.length > 2) {
        return null;
    }

    if (options.length === 2) {
        const first = options[0];
        const second = options[1];
        const firstScore = booleanScore(`${first.name} ${first.index}`);
        const secondScore = booleanScore(`${second.name} ${second.index}`);
        const hasBooleanSignal = firstScore !== 0 || secondScore !== 0 || node.fieldType === 'BOOLEAN';

        if (!hasBooleanSignal) {
            return null;
        }

        let checkedOption = second;
        let uncheckedOption = first;

        if (firstScore !== secondScore) {
            if (firstScore > secondScore) {
                checkedOption = first;
                uncheckedOption = second;
            }
        } else if (firstScore > 0) {
            checkedOption = first;
            uncheckedOption = second;
        } else if (firstScore < 0) {
            checkedOption = second;
            uncheckedOption = first;
        }

        return {
            checked: inferBooleanValue(node.fieldValue, checkedOption.index, uncheckedOption.index),
            checkedLabel: sanitizeText(checkedOption.name) || 'On',
            checkedValue: checkedOption.index,
            uncheckedLabel: sanitizeText(uncheckedOption.name) || 'Off',
            uncheckedValue: uncheckedOption.index,
        };
    }

    if (options.length === 1 && node.fieldType !== 'BOOLEAN') {
        return null;
    }

    return {
        checked: inferBooleanValue(node.fieldValue, 'true', 'false'),
        checkedLabel: 'On',
        checkedValue: 'true',
        uncheckedLabel: 'Off',
        uncheckedValue: 'false',
    };
};
