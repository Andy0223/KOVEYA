export type Environment = {
  Bindings: {
    DB: D1Database;
    APP_ORIGIN?: string;
    LOCAL_EMAIL_PREVIEW?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
  Variables: { requestId: string; userId: string; sessionHash: string };
};
