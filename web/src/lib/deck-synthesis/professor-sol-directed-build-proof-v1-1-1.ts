/**
 * SHA-256 proof chain helpers for Sol-directed GUI builds.
 */
import { createHash } from "node:crypto";
import type { SolDirectedBuildProofChainV111 } from "./professor-sol-directed-build-types-v1-1-1";

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sha256String(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildProofChainV111(args: {
  buildInput: unknown;
  architectRaw: unknown | null;
  retrievalContract: unknown | null;
  candidateDictionary: unknown | null;
  constructorInput: unknown | null;
  constructorRaw: unknown | null;
  canonicalizedDeck: unknown | null;
  validation: unknown | null;
  headProfessorInputDeck: unknown | null;
  headProfessorResponse: unknown | null;
}): SolDirectedBuildProofChainV111 {
  const canonicalizedDeckHash = args.canonicalizedDeck ? sha256Json(args.canonicalizedDeck) : null;
  const headProfessorInputDeckHash = args.headProfessorInputDeck ? sha256Json(args.headProfessorInputDeck) : null;
  return {
    buildInputHash: sha256Json(args.buildInput),
    architectRawHash: args.architectRaw ? sha256Json(args.architectRaw) : null,
    retrievalContractHash: args.retrievalContract ? sha256Json(args.retrievalContract) : null,
    candidateUniverseHash: args.candidateDictionary ? sha256Json(args.candidateDictionary) : null,
    constructorInputHash: args.constructorInput ? sha256Json(args.constructorInput) : null,
    constructorRawHash: args.constructorRaw ? sha256Json(args.constructorRaw) : null,
    canonicalizedDeckHash,
    validationHash: args.validation ? sha256Json(args.validation) : null,
    headProfessorInputDeckHash,
    headProfessorResponseHash: args.headProfessorResponse ? sha256Json(args.headProfessorResponse) : null,
    headProfessorDeckMatch:
      canonicalizedDeckHash && headProfessorInputDeckHash
        ? canonicalizedDeckHash === headProfessorInputDeckHash
        : null,
  };
}
