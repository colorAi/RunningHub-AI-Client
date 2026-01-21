import { NodeInfo, ListOption } from '../types';

export const parseListOptions = (node: NodeInfo): ListOption[] => {
    // 支持多种识别方式：
    // 1. fieldType === 'LIST' (标准)
    // 2. fieldType === 'SWITCH' 且有 fieldData (RunningHub 的 ImpactSwitch 节点)
    // 3. fieldName === 'select' 且有 fieldData (通用选择器)
    const isListType = node.fieldType === 'LIST';
    const isSwitchWithData = node.fieldType === 'SWITCH' && node.fieldData;
    const isSelectField = node.fieldName === 'select' && node.fieldData;

    if (!isListType && !isSwitchWithData && !isSelectField) {
        return [];
    }

    const fallback = node.fieldValue ? [{ name: node.fieldValue, index: node.fieldValue }] : [];

    if (!node.fieldData) {
        return fallback;
    }

    try {
        let parsed: any;

        // Handle if fieldData is already an object (not stringified)
        if (typeof node.fieldData === 'object' && node.fieldData !== null) {
            parsed = node.fieldData;
        } else {
            try {
                parsed = JSON.parse(node.fieldData);
            } catch (e) {
                // Handle comma-separated string
                if (typeof node.fieldData === 'string' && node.fieldData.includes(',')) {
                    const options = node.fieldData.split(',').map((s) => ({
                        name: s.trim(),
                        index: s.trim()
                    })).filter(opt => opt.name);
                    return options.length > 0 ? options : fallback;
                }
                // If not comma separated and parse failed, return fallback
                return fallback;
            }
        }

        if (Array.isArray(parsed)) {
            // 1. Array of Objects
            if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null && !Array.isArray(parsed[0])) {
                const options = parsed.map((item: any) => {
                    // Strategy 1: name/index (Standard)
                    if ('name' in item) {
                        return {
                            name: item.description ? `${item.name} - ${item.description}` : String(item.name),
                            index: item.index !== undefined ? String(item.index) : String(item.name)
                        };
                    }
                    // Strategy 2: label/value
                    if ('label' in item) {
                        return {
                            name: String(item.label),
                            index: item.value !== undefined ? String(item.value) : String(item.label)
                        };
                    }
                    // Strategy 3: text/value or text/id
                    if ('text' in item) {
                        return {
                            name: String(item.text),
                            index: item.value !== undefined ? String(item.value) : (item.id !== undefined ? String(item.id) : String(item.text))
                        };
                    }

                    // Strategy 4: Fallback - use values
                    const values = Object.values(item);
                    if (values.length >= 2) {
                        return { name: String(values[0]), index: String(values[1]) };
                    } else if (values.length === 1) {
                        return { name: String(values[0]), index: String(values[0]) };
                    }
                    return { name: JSON.stringify(item), index: JSON.stringify(item) };
                });
                return options.length > 0 ? options : fallback;
            }

            // 2. Nested Array: [["A", "B"]] or [["A", "B"], {"default": "A"}]
            if (parsed.length > 0 && Array.isArray(parsed[0])) {
                // Assume the first element is the list of options
                const options = parsed[0].map((item: any) => ({
                    name: String(item),
                    index: String(item) // Use item as value
                }));
                return options.length > 0 ? options : fallback;
            }

            // 3. Simple Array: ["A", "B"]
            const options = parsed.map((item: any) => ({
                name: String(item),
                index: String(item)
            }));
            return options.length > 0 ? options : fallback;
        }
    } catch (e) {
        console.error('Error parsing list options:', e);
    }

    return fallback;
};
