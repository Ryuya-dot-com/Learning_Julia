using Pkg

project_dir = normpath(joinpath(@__DIR__, "..", "validation", "categorical"))
Pkg.activate(project_dir)
println("CATEGORICAL_VALIDATION_PROJECT ", Base.active_project())
Pkg.instantiate()
Pkg.precompile()
