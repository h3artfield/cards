import { getDeploymentIdentity } from "@/lib/deployment-identity";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getDeploymentIdentity());
}
