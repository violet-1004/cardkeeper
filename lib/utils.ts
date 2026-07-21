export const toSnakeCase = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res: { [key: string]: any } = {};
    Object.keys(obj).forEach(k => {
        const snake = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        res[snake] = obj[k];
    });
    return res;
};

export const toCamelCase = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res: { [key: string]: any } = {};
    Object.keys(obj).forEach(k => {
        const camel = k.replace(/_([a-z])/g, g => g[1].toUpperCase());
        res[camel] = obj[k];
    });
    return res;
};