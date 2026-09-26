export const getApiErrorCode = (error: unknown): string | undefined => {
    const code = (error as { response?: { data?: { error?: { code?: unknown } } } })
        .response?.data?.error?.code;
    return typeof code === 'string' ? code : undefined;
};
