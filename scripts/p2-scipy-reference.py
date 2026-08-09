#!/usr/bin/env python3

"""Independent SciPy reference fits for the isolated P2 validation track."""

import argparse
import csv
import math

import numpy as np
import scipy
from scipy import stats
from scipy.optimize import minimize


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("input CSV is empty")
    values = np.asarray([float(row["observed"]) for row in rows], dtype=float)
    states = [row["state"] for row in rows]
    return values, states


def censored_fit(values, states, lower, upper):
    uncensored = values[np.asarray([state == "uncensored" for state in states])]
    left = values[np.asarray([state == "left" for state in states])]
    right = values[np.asarray([state == "right" for state in states])]
    data = stats.CensoredData(uncensored=uncensored, left=left, right=right)
    mu, sigma = stats.norm.fit(data)
    distribution = stats.norm(loc=mu, scale=sigma)
    nll = -(
        np.sum(distribution.logpdf(uncensored))
        + len(left) * distribution.logcdf(lower)
        + len(right) * distribution.logsf(upper)
    )
    return mu, sigma, nll, True, "scipy.stats.CensoredData+norm.fit"


def truncated_fit(values, lower, upper):
    initial_candidates = [
        np.asarray([np.mean(values), math.log(np.std(values, ddof=0))])
    ]
    if math.isfinite(lower) and math.isfinite(upper):
        width = upper - lower
        center = (lower + upper) / 2
        initial_candidates.extend(
            np.asarray([center, math.log(multiplier * width)])
            for multiplier in (0.5, 1.0, 2.0, 4.0)
        )

    def objective(raw):
        sigma = math.exp(raw[1])
        distribution = stats.truncate(
            stats.Normal(mu=raw[0], sigma=sigma),
            lb=lower,
            ub=upper,
        )
        return -float(np.sum(distribution.logpdf(values)))

    results = [
        minimize(
            objective,
            initial,
            method="Nelder-Mead",
            options={"maxiter": 10_000, "xatol": 1e-10, "fatol": 1e-10},
        )
        for initial in initial_candidates
    ]
    successful = [result for result in results if result.success]
    if not successful:
        messages = "; ".join(str(result.message) for result in results)
        raise RuntimeError(f"all SciPy truncation starts failed: {messages}")
    result = min(successful, key=lambda candidate: candidate.fun)
    mu, log_sigma = result.x
    return (
        mu,
        math.exp(log_sigma),
        result.fun,
        bool(result.success),
        "scipy.stats.truncate+scipy.optimize.Nelder-Mead",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("censored", "truncated"), required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--lower", type=float, required=True)
    parser.add_argument("--upper", type=float, required=True)
    args = parser.parse_args()

    values, states = read_rows(args.input)
    if args.mode == "censored":
        result = censored_fit(values, states, args.lower, args.upper)
    else:
        if any(state != "selected" for state in states):
            raise ValueError("truncated input states must all be selected")
        result = truncated_fit(values, args.lower, args.upper)

    mu, sigma, nll, success, engine = result
    fields = (
        format(mu, ".17g"),
        format(sigma, ".17g"),
        format(nll, ".17g"),
        "true" if success else "false",
        scipy.__version__,
        np.__version__,
        engine,
    )
    print("\t".join(fields))


if __name__ == "__main__":
    main()
