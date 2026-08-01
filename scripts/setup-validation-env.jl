#!/usr/bin/env julia

# 教材の自動検証に必要な、コミット済みvalidation環境を復元する。
# 例: julia --project=validation scripts/setup-validation-env.jl

using Pkg

project = Base.active_project()
isnothing(project) && error("No active Julia project. Use --project=validation.")
println("VALIDATION_PROJECT ", project)
Pkg.instantiate()
Pkg.precompile()
