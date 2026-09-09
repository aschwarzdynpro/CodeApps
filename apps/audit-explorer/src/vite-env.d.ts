/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Dataverse org URL of the environment this build is deployed to, e.g.
   * https://operations-d365-schulz-uat-1-1.crm4.dynamics.com — used to build
   * deep links into the model-driven app. Deliberately empty in `.env`: it is
   * environment-specific, so each deployment sets it in `.env.local`, and the
   * links stay hidden rather than pointing at the wrong tenant.
   */
  readonly VITE_ORG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
