/** True when running on Cloud Run (or when Firestore is explicitly required). */
export function isCloudDeployment(): boolean {
  return (
    process.env.K_SERVICE != null ||
    process.env.REQUIRE_FIRESTORE === "true" ||
    process.env.NODE_ENV === "production"
  );
}
