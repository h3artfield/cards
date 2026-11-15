"""ODSG v1 PyTorch Model 1 / Model 2. Architecture matches the frozen numpy spec."""

from __future__ import annotations

import math

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from odsg_v1_architecture import HIDDEN_DIM, INIT_SEED, LATENT_DIM, init_backbone, init_interaction


def gelu_tanh(x: torch.Tensor) -> torch.Tensor:
    return 0.5 * x * (1.0 + torch.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * x.pow(3))))


class SharedStrength(nn.Module):
    def __init__(self, input_dim: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(input_dim, HIDDEN_DIM)
        self.fc2 = nn.Linear(HIDDEN_DIM, LATENT_DIM)
        self.strength = nn.Linear(LATENT_DIM, 1)

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        return gelu_tanh(self.fc2(gelu_tanh(self.fc1(x))))

    def scalar(self, h: torch.Tensor) -> torch.Tensor:
        return self.strength(h).squeeze(-1)

    def utilities(self, x: torch.Tensor) -> torch.Tensor:
        return self.scalar(self.encode(x))


class Model2(nn.Module):
    def __init__(self, input_dim: int, rank: int) -> None:
        super().__init__()
        self.backbone = SharedStrength(input_dim)
        self.A = nn.Parameter(torch.zeros(rank, LATENT_DIM))
        self.B = nn.Parameter(torch.zeros(rank, LATENT_DIM))

    def interaction_sum(self, h: torch.Tensor) -> torch.Tensor:
        a = F.linear(h, self.A)
        b = F.linear(h, self.B)
        sum_a = a.sum(dim=-2, keepdim=True)
        sum_b = b.sum(dim=-2, keepdim=True)
        return (a * sum_b).sum(dim=-1) - (sum_a * b).sum(dim=-1)

    def utilities(self, x: torch.Tensor) -> torch.Tensor:
        h = self.backbone.encode(x)
        return self.backbone.scalar(h) + self.interaction_sum(h)


def load_numpy_backbone(module: SharedStrength, input_dim: int, seed: int = INIT_SEED) -> None:
    bb = init_backbone(input_dim, seed=seed)
    with torch.no_grad():
        module.fc1.weight.copy_(torch.from_numpy(np.array(bb.w1)))
        module.fc1.bias.copy_(torch.from_numpy(np.array(bb.b1)))
        module.fc2.weight.copy_(torch.from_numpy(np.array(bb.w2)))
        module.fc2.bias.copy_(torch.from_numpy(np.array(bb.b2)))
        module.strength.weight.copy_(torch.from_numpy(np.array(bb.w_s)))
        module.strength.bias.copy_(torch.from_numpy(np.array(bb.b_s)))


def load_numpy_interaction(module: Model2, rank: int, seed: int = INIT_SEED + 1) -> None:
    maps = init_interaction(rank, seed=seed)
    with torch.no_grad():
        module.A.copy_(torch.from_numpy(np.array(maps.A)))
        module.B.copy_(torch.from_numpy(np.array(maps.B)))


def build_model1(input_dim: int, device: torch.device) -> SharedStrength:
    m = SharedStrength(input_dim)
    load_numpy_backbone(m, input_dim)
    return m.to(device)


def build_model2(input_dim: int, rank: int, device: torch.device) -> Model2:
    m = Model2(input_dim, rank)
    load_numpy_backbone(m.backbone, input_dim)
    load_numpy_interaction(m, rank)
    return m.to(device)


def interaction_l2(model: Model2) -> torch.Tensor:
    return model.A.pow(2).sum() + model.B.pow(2).sum()
