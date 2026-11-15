"""
ODSG v1 nested Model 1 / Model 2 — architecture only.
No training. No outcome inputs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

LATENT_DIM = 128
HIDDEN_DIM = 256
STRENGTH_RANKS = (2, 4, 8, 16, 32)
INIT_SEED = 20260821
DTYPE = np.float32


def gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * np.power(x, 3))))


def softmax(u: np.ndarray) -> np.ndarray:
    z = u - np.max(u, axis=-1, keepdims=True)
    e = np.exp(z)
    return e / np.sum(e, axis=-1, keepdims=True)


def kaiming_uniform(rng: np.random.Generator, fan_in: int, fan_out: int) -> np.ndarray:
    bound = math.sqrt(6.0 / fan_in)
    return rng.uniform(-bound, bound, size=(fan_out, fan_in)).astype(DTYPE)


@dataclass
class SharedBackbone:
    w1: np.ndarray
    b1: np.ndarray
    w2: np.ndarray
    b2: np.ndarray
    w_s: np.ndarray
    b_s: np.ndarray

    def encode(self, x: np.ndarray) -> np.ndarray:
        h = gelu(x @ self.w1.T + self.b1)
        return gelu(h @ self.w2.T + self.b2)

    def strength(self, h: np.ndarray) -> np.ndarray:
        return h @ self.w_s.T + self.b_s


@dataclass
class InteractionMaps:
    A: np.ndarray
    B: np.ndarray

    def pair(self, h_a: np.ndarray, h_b: np.ndarray) -> np.ndarray:
        a_a = h_a @ self.A.T
        b_b = h_b @ self.B.T
        a_b = h_b @ self.A.T
        b_a = h_a @ self.B.T
        return np.sum(a_a * b_b, axis=-1) - np.sum(a_b * b_a, axis=-1)


def init_backbone(input_dim: int, seed: int = INIT_SEED) -> SharedBackbone:
    rng = np.random.default_rng(seed)
    return SharedBackbone(
        w1=kaiming_uniform(rng, input_dim, HIDDEN_DIM),
        b1=np.zeros(HIDDEN_DIM, dtype=DTYPE),
        w2=kaiming_uniform(rng, HIDDEN_DIM, LATENT_DIM),
        b2=np.zeros(LATENT_DIM, dtype=DTYPE),
        w_s=kaiming_uniform(rng, LATENT_DIM, 1),
        b_s=np.zeros(1, dtype=DTYPE),
    )


def init_interaction(rank: int, seed: int = INIT_SEED + 1) -> InteractionMaps:
    rng = np.random.default_rng(seed)
    return InteractionMaps(
        A=kaiming_uniform(rng, LATENT_DIM, rank),
        B=kaiming_uniform(rng, LATENT_DIM, rank),
    )


def model1_utilities(backbone: SharedBackbone, xs: np.ndarray) -> np.ndarray:
    h = backbone.encode(xs)
    return backbone.strength(h).reshape(-1)


def model2_utilities(backbone: SharedBackbone, maps: InteractionMaps, xs: np.ndarray) -> np.ndarray:
    h = backbone.encode(xs)
    s = backbone.strength(h).reshape(-1)
    n = h.shape[0]
    u = s.copy()
    for i in range(n):
        acc = 0.0
        for j in range(n):
            if i == j:
                continue
            acc += float(maps.pair(h[i], h[j]))
        u[i] = s[i] + acc
    return u


def run_selftest() -> None:
    rng = np.random.default_rng(0)
    x = rng.normal(size=(4, 32)).astype(np.float32)
    bb = init_backbone(32, seed=INIT_SEED)
    maps = init_interaction(8, seed=INIT_SEED + 1)
    u1 = model1_utilities(bb, x)
    p1 = softmax(u1)
    if u1.shape != (4,) or not np.allclose(p1.sum(), 1.0, atol=1e-6):
        raise SystemExit("Model 1 softmax failed")
    zero = InteractionMaps(A=np.zeros_like(maps.A), B=np.zeros_like(maps.B))
    if not np.allclose(model2_utilities(bb, zero, x), u1, atol=1e-5):
        raise SystemExit("interaction disabled must reduce to Model 1")
    h = bb.encode(x)
    for i in range(4):
        for j in range(4):
            ij = float(maps.pair(h[i], h[j]))
            ji = float(maps.pair(h[j], h[i]))
            if abs(ij + ji) >= 1e-5:
                raise SystemExit(f"I not antisymmetric at {i},{j}")
            if i == j and abs(ij) >= 1e-5:
                raise SystemExit("I(A,A) must be 0")
    p2 = softmax(model2_utilities(bb, maps, x))
    perm = np.array([2, 0, 3, 1])
    p2_perm = softmax(model2_utilities(bb, maps, x[perm]))
    if not np.allclose(p2_perm, p2[perm], atol=1e-5):
        raise SystemExit("permutation equivariance failed")
    counts = parameter_counts(4322, 8)
    if counts["model2"] != counts["model1"] + counts["interaction"]:
        raise SystemExit("parameter count nesting failed")
    print("ALL PASS — odsg_v1_architecture.selftest")


def parameter_counts(input_dim: int, rank: int) -> dict:
    enc = input_dim * HIDDEN_DIM + HIDDEN_DIM + HIDDEN_DIM * LATENT_DIM + LATENT_DIM
    strength = LATENT_DIM + 1
    interaction = 2 * rank * LATENT_DIM
    return {
        "inputDim": input_dim,
        "encoder": enc,
        "strengthHead": strength,
        "model1": enc + strength,
        "interactionRank": rank,
        "interaction": interaction,
        "model2": enc + strength + interaction,
    }
