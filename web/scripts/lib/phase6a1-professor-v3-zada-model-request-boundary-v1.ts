/**
 * Stub boundary for Zada executable-stack sealing — prevents OpenAI network calls.
 */
export const PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_STUB_V1 =
  "PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_STUB_V1";

export const PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1 =
  "MODEL_REQUEST_BOUNDARY_BEFORE_OPENAI";

export class ProfessorV3ZadaModelRequestBoundaryErrorV1 extends Error {
  readonly code = PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_STUB_V1;
  readonly reachedStage = PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1;

  constructor(message = "Professor v3 Zada model request boundary stub — OpenAI call prevented") {
    super(message);
    this.name = "ProfessorV3ZadaModelRequestBoundaryErrorV1";
  }
}

export function isProfessorV3ZadaModelRequestBoundaryErrorV1(
  error: unknown,
): error is ProfessorV3ZadaModelRequestBoundaryErrorV1 {
  return error instanceof ProfessorV3ZadaModelRequestBoundaryErrorV1;
}

export function createProfessorV3ZadaModelRequestBoundaryFetchStubV1(): typeof fetch {
  return async () => {
    throw new ProfessorV3ZadaModelRequestBoundaryErrorV1();
  };
}
