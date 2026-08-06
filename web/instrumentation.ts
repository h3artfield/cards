export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isCloudDeployment } = await import("./src/lib/cloud-env");
    const { ensureFirebaseAdmin, getServiceAccountKeyIssue } = await import(
      "./src/lib/firebase/admin"
    );

    if (isCloudDeployment()) {
      const keyIssue = getServiceAccountKeyIssue();
      if (
        keyIssue &&
        !process.env.K_SERVICE &&
        (process.env.FIREBASE_PROJECT_ID ||
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
      ) {
        console.warn(`[firebase] ${keyIssue}`);
      }

      const status = ensureFirebaseAdmin();
      if (!status.initialized) {
        const message =
          status.error ??
          "Firestore is required in cloud deployments but Firebase Admin failed to initialize.";
        console.error(`[firebase] FATAL: ${message}`);
        throw new Error(message);
      }
      console.log(
        `[firebase] Admin connected — project ${status.projectId}, storage: firestore`,
      );
      return;
    }

    const keyIssue = getServiceAccountKeyIssue();
    if (
      keyIssue &&
      (process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
    ) {
      console.warn(`[firebase] ${keyIssue}`);
      return;
    }

    const status = ensureFirebaseAdmin();

    if (status.configured && status.initialized) {
      console.log(
        `[firebase] Admin connected — project ${status.projectId}, storage: firestore`,
      );
    } else if (status.configured && status.error) {
      console.warn(`[firebase] Admin failed: ${status.error}`);
    } else if (!status.configured) {
      console.log("[firebase] Admin not configured — using in-memory storage");
    }
  }
}
