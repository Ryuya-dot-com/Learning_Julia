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

active_project = Base.active_project()
isnothing(active_project) && error("No active Julia project. Use --project=validation.")
project_dir = dirname(active_project)
categorical_project_dir = joinpath(ROOT, "validation", "categorical")
p2_likelihood_project_dir = joinpath(ROOT, "validation", "p2-likelihood")

started = time()
for (i, relative_path) in enumerate(CHECKS)
    println("\nNUMERIC_CHECK [", i, "/", length(CHECKS), "] ", relative_path)
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

println("\nNUMERIC_CHECK_PASS files=", length(CHECKS),
        " elapsed_seconds=", round(time() - started; digits = 1))
