"""Algebraic checks for CMMG C2. Does not inspect frozen matchup geometry."""

from __future__ import annotations

import torch

from cmmg_v1_models import CommanderMatchup, CommanderStrength


def _interaction(model: CommanderMatchup, i: int, j: int) -> float:
    idx = torch.tensor([[i, j, i, j]], dtype=torch.long)
    a = model.A(idx)
    b = model.B(idx)
    ac, ad = a[0, 0], a[0, 1]
    bc, bd = b[0, 0], b[0, 1]
    return float((ac * bd - ad * bc).sum())


def test_antisymmetry_and_zero_diag() -> None:
    torch.manual_seed(0)
    m = CommanderMatchup(8, 4)
    for i in range(1, 9):
        assert abs(_interaction(m, i, i)) < 1e-6
        for j in range(1, 9):
            assert abs(_interaction(m, i, j) + _interaction(m, j, i)) < 1e-6


def test_c2_disabled_matches_c1() -> None:
    c1 = CommanderStrength(5)
    c2 = CommanderMatchup(5, 3)
    with torch.no_grad():
        c2.backbone.S.weight.copy_(c1.S.weight)
        c2.A.weight.zero_()
        c2.B.weight.zero_()
    idx = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
    assert torch.allclose(c1.utilities(idx), c2.utilities(idx), atol=1e-6)


def test_permutation_equivariance() -> None:
    torch.manual_seed(1)
    m = CommanderMatchup(6, 2)
    idx = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
    perm = torch.tensor([2, 0, 3, 1])
    u = m.utilities(idx)
    up = m.utilities(idx[:, perm])
    assert torch.allclose(u[:, perm], up, atol=1e-6)


if __name__ == "__main__":
    test_antisymmetry_and_zero_diag()
    test_c2_disabled_matches_c1()
    test_permutation_equivariance()
    print("ok")
