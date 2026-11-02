// Keep Worker bindings typed without adding Worker DOM globals to the browser UI.
declare module "cloudflare:workers" {
  export const env: {
    DB?: import("@cloudflare/workers-types").D1Database;
    FEEDBACK_ADMIN_EMAIL?: string;
    FEEDBACK_RATE_LIMIT_SECRET?: string;
  };
}
