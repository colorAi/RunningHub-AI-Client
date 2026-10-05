import type { NodeInfo } from '../../types';

export const primaryLabel = (node: NodeInfo) => {
    if (node.description && node.description.trim()) return node.description;
    return node.fieldName || node.nodeName;
};
