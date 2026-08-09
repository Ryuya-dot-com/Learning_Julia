#!/usr/bin/env julia

# P2隔離環境を空の一時depotへinstantiate＋precompileし、導入costを観測する。
# networkとmachine性能に依存するためCIの合否条件にはせず、候補昇格時の判断材料にする。
const ROOT = normpath(joinpath(@__DIR__, ".."))
const PROJECT = joinpath(ROOT, "validation", "p2-likelihood")
const CHILD_CODE = "using Pkg; Pkg.instantiate(); Pkg.precompile()"

function directory_bytes(root)
    total = 0
    for (directory, _, files) in walkdir(root), file in files
        path = joinpath(directory, file)
        islink(path) || (total += filesize(path))
    end
    total
end

mktempdir(; prefix = "learning-julia-p2-depot-") do depot
    command = addenv(
        `$(Base.julia_cmd()) --startup-file=no --project=$(PROJECT) -e $(CHILD_CODE)`,
        "JULIA_DEPOT_PATH" => depot,
        "JULIA_PKG_PRECOMPILE_AUTO" => "0",
    )
    elapsed = @elapsed run(command)
    bytes = directory_bytes(depot)
    println((
        project = relpath(PROJECT, ROOT),
        elapsed_seconds = round(elapsed; digits = 1),
        depot_megabytes = round(bytes / 1024^2; digits = 1),
        cleanup = "temporary depot removed automatically",
    ))
end
