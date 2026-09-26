interface Env {
    REGION?: string,
    ENDPOINT?: string,
    BUCKET: string,
    ACCESS_KEY_ID?: string,
    SECRET_ACCESS_KEY?: string,
    SESSION_SECRET?: string,
    R2_BUCKET?: R2Bucket,
    PASSWORD?: string,
    MAX_UPLOAD_SIZE_MB?: string,
}

export default Env;
