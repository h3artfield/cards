"""CMMG v1 commander-identity models. No exact lists. No I(c,d) inspection helpers."""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

UNK = 0
INIT_SEED = 20260821


class CommanderStrength(nn.Module):
    def __init__(self, n_ident: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=UNK)
        nn.init.zeros_(self.S.weight)

    def utilities(self, idx: torch.Tensor) -> torch.Tensor:
        return self.S(idx).squeeze(-1)

    def center_strength(self) -> None:
        with torch.no_grad():
            seen = self.S.weight[1:]
            self.S.weight[1:] -= seen.mean()


class CommanderMatchup(nn.Module):
    def __init__(self, n_ident: int, rank: int) -> None:
        super().__init__()
        self.backbone = CommanderStrength(n_ident)
        self.A = nn.Embedding(n_ident + 1, rank, padding_idx=UNK)
        self.B = nn.Embedding(n_ident + 1, rank, padding_idx=UNK)
        nn.init.normal_(self.A.weight, mean=0.0, std=0.01)
        nn.init.normal_(self.B.weight, mean=0.0, std=0.01)
        with torch.no_grad():
            self.A.weight[UNK].zero_()
            self.B.weight[UNK].zero_()

    def utilities(self, idx: torch.Tensor) -> torch.Tensor:
        s = self.backbone.utilities(idx)
        a = self.A(idx)
        b = self.B(idx)
        sum_a = a.sum(dim=-2, keepdim=True)
        sum_b = b.sum(dim=-2, keepdim=True)
        inter = (a * sum_b).sum(dim=-1) - (sum_a * b).sum(dim=-1)
        return s + inter

    def center_strength(self) -> None:
        self.backbone.center_strength()


def strength_l2(model: nn.Module) -> torch.Tensor:
    S = model.S.weight[1:] if isinstance(model, CommanderStrength) else model.backbone.S.weight[1:]
    return S.pow(2).sum()


def interaction_l2(model: CommanderMatchup) -> torch.Tensor:
    return model.A.weight[1:].pow(2).sum() + model.B.weight[1:].pow(2).sum()


def set_seeds(seed: int = INIT_SEED) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
