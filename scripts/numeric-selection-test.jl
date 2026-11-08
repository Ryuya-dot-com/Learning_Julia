using Test

runner = joinpath(@__DIR__, "run-numeric-checks.jl")
command = `$(Base.julia_cmd()) --startup-file=no $runner`
listed(args...) = split(chomp(read(`$command $args --list`, String)), '\n')

@testset "数値検証の対象選択" begin
    all_checks = listed()
    public_checks = listed("--public")
    p2_checks = listed("--p2")
    @test !isempty(public_checks) && !isempty(p2_checks)
    @test all(!startswith(path, "scripts/p2-") for path in public_checks)
    @test all(startswith(path, "scripts/p2-") for path in p2_checks)
    @test isempty(intersect(public_checks, p2_checks))
    @test sort(vcat(public_checks, p2_checks)) == sort(all_checks)
    @test length(unique(all_checks)) == length(all_checks)
    for args in (["--unknown"], ["--public", "--p2"], ["--p2", "--p2"])
        errors = IOBuffer()
        process = run(pipeline(ignorestatus(`$command $args`); stdout = devnull, stderr = errors))
        @test !success(process)
        @test occursin("usage:", String(take!(errors)))
    end
end
