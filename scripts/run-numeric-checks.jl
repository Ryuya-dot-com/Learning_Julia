#!/usr/bin/env julia

const ROOT = normpath(joinpath(@__DIR__, ".."))
const CHECKS = [
    "scripts/batch-csv-io-check.jl",
    "scripts/distribution-fit-check.jl",
    "scripts/distribution-structure-check.jl",
    "scripts/p0-p1-pipeline-check.jl",
    "scripts/p2-likelihood-check.jl",
    "scripts/p2-likelihood-stress-check.jl",
    "scripts/p2-identification-profile-check.jl",
    "scripts/p2-generalization-engine-check.jl",
    "scripts/p2-two-sided-identification-check.jl",
    "scripts/p2-selection-count-check.jl",
    "scripts/p2-selection-count-robustness-check.jl",
    "scripts/p2-selection-count-interval-check.jl",
    "scripts/p2-selection-count-report-io-check.jl",
    "scripts/p2-selection-count-api-boundary-check.jl",
    "scripts/p2-selection-count-local-server-check.jl",
    "scripts/p2-learner-usability-protocol-check.jl",
    "scripts/data-persistence-check.jl",
    "scripts/reproducible-workflow-check.jl",
    "scripts/reproducible-template-check.jl",
    "scripts/version-control-boundary-check.jl",
    "scripts/probability-inference-check.jl",
    "scripts/association-check.jl",
    "scripts/linear-model-unification-check.jl",
    "scripts/multiple-regression-ancova-check.jl",
    "scripts/regression-diagnostics-check.jl",
    "scripts/logistic-regression-check.jl",
    "scripts/categorical-outcomes-check.jl",
    "scripts/classical-test-theory-check.jl",
    "scripts/validity-evidence-check.jl",
    "scripts/mixed-models-check.jl",
    "scripts/measurement-error-check.jl",
    "scripts/power-design-check.jl",
]

# 引数なしは従来どおり全検査。--list は環境準備前でも対象を確認できる。
ARGS in ([], ["--public"], ["--p2"], ["--list"],
         ["--public", "--list"], ["--p2", "--list"]) ||
    error("usage: run-numeric-checks.jl [--public|--p2] [--list]")
scope = "--public" in ARGS ? :public : "--p2" in ARGS ? :p2 : :all
checks = filter(CHECKS) do path
    scope == :all || startswith(basename(path), "p2-") == (scope == :p2)
end
if "--list" in ARGS
    println.(checks)
    exit(0)
end

active_project = Base.active_project()
isnothing(active_project) && error("No active Julia project. Use --project=validation.")
project_dir = dirname(active_project)
categorical_project_dir = joinpath(ROOT, "validation", "categorical")
p2_likelihood_project_dir = joinpath(ROOT, "validation", "p2-likelihood")

started = time()
for (i, relative_path) in enumerate(checks)
    println("\nNUMERIC_CHECK [", i, "/", length(checks), "] ", relative_path)
    flush(stdout)
    path = joinpath(ROOT, relative_path)
    check_project = if endswith(relative_path, "categorical-outcomes-check.jl")
        categorical_project_dir
    elseif startswith(basename(relative_path), "p2-")
        p2_likelihood_project_dir
    else
        project_dir
    end
    run(`$(Base.julia_cmd()) --project=$check_project $path`)
end

println("\nNUMERIC_CHECK_PASS files=", length(checks), " scope=", scope,
        " elapsed_seconds=", round(time() - started; digits = 1))
