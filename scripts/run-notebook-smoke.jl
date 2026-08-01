#!/usr/bin/env julia

const ROOT = normpath(joinpath(@__DIR__, ".."))
const NOTEBOOKS = [
    "public/notebooks/nb1-data.jl",
    "public/notebooks/nb2-stats.jl",
    "public/notebooks/nb3-sim.jl",
    "public/notebooks/nb4-model.jl",
    "public/notebooks/nb5-advanced.jl",
]

active_project = Base.active_project()
isnothing(active_project) && error("No active Julia project. Use --project=validation.")
project_dir = dirname(active_project)
runner = joinpath(ROOT, "scripts", "nb-exec-check.jl")

started = time()
for (i, relative_path) in enumerate(NOTEBOOKS)
    println("\nNOTEBOOK_SMOKE [", i, "/", length(NOTEBOOKS), "] ", relative_path)
    flush(stdout)
    path = joinpath(ROOT, relative_path)
    run(`$(Base.julia_cmd()) --project=$project_dir $runner $path`)
end

println("\nNOTEBOOK_SMOKE_PASS files=", length(NOTEBOOKS),
        " elapsed_seconds=", round(time() - started; digits = 1))
