/**
 * Stub boundary for Yuriko executable-stack sealing — prevents OpenAI network calls.
 */
export const PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_STUB_V1 =
  "PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_STUB_V1";

export const PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_REACHED_V1 =
  "MODEL_REQUEST_BOUNDARY_BEFORE_OPENAI";

export class ProfessorV3YurikoModelRequestBoundaryErrorV1 extends Error {
  readonly code = PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_STUB_V1;
  readonly reachedStage = PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_REACHED_V1;

  constructor(message = "Professor v3 Yuriko model request boundary stub — OpenAI call prevented") {
    super(message);
    this.name = "ProfessorV3YurikoModelRequestBoundaryErrorV1";
  }
}

export function isProfessorV3YurikoModelRequestBoundaryErrorV1(
  error: unknown,
): error is ProfessorV3YurikoModelRequestBoundaryErrorV1 {
  return error instanceof ProfessorV3YurikoModelRequestBoundaryErrorV1;
}

export function createProfessorV3YurikoModelRequestBoundaryFetchStubV1(): typeof fetch {
  return async () => {
    throw new ProfessorV3YurikoModelRequestBoundaryErrorV1();
  };
}
