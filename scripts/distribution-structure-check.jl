using Distributions
using LinearAlgebra
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p0-p1-contracts.jl"))
using .P0P1Contracts

@testset "観測境界・依存・混合分布" begin
    @testset "truncatedとcensoredは別の観測過程" begin
        latent = Normal(100, 15)
        lower, upper = 90.0, 120.0
        selected = truncated(latent; lower, upper)
        recorded = censored(latent; lower, upper)

        @test extrema(selected) == (lower, upper)
        @test extrema(recorded) == (lower, upper)
        @test cdf(selected, lower) == 0.0
        @test cdf(selected, upper) == 1.0
        @test cdf(recorded, lower) ≈ cdf(latent, lower)
        @test pdf(recorded, lower) ≈ cdf(latent, lower)
        @test pdf(recorded, upper) ≈ ccdf(latent, upper)
        @test pdf(selected, 100.0) > pdf(latent, 100.0)
        @test pdf(recorded, 100.0) ≈ pdf(latent, 100.0)
        @test mean(selected) > mean(recorded) > mean(latent)
        @test_throws ErrorException truncated(latent; lower = 120, upper = 90)
    end

    @testset "除外と測定限界をsimulationで復元する" begin
        latent_distribution = Normal(100, 15)
        lower = 90.0
        latent = rand(Xoshiro(20260811), latent_distribution, 100_000)
        excluded = latent[latent .>= lower]
        limited = max.(latent, lower)

        selected_distribution = truncated(latent_distribution; lower)
        censored_distribution = censored(latent_distribution; lower)

        @test length(excluded) < length(latent)
        @test length(limited) == length(latent)
        @test all(>=(lower), excluded)
        @test all(>=(lower), limited)
        @test count(==(lower), excluded) == 0
        @test isapprox(
            count(==(lower), limited) / length(limited),
            cdf(latent_distribution, lower);
            atol = 0.005,
        )
        @test isapprox(mean(excluded), mean(selected_distribution); atol = 0.2)
        @test isapprox(mean(limited), mean(censored_distribution); atol = 0.2)
        @test mean(excluded) > mean(limited) > mean(latent)

        truncated_draws = rand(Xoshiro(20260812), selected_distribution, 20_000)
        censored_draws = rand(Xoshiro(20260813), censored_distribution, 20_000)
        @test all(>=(lower), truncated_draws)
        @test all(>=(lower), censored_draws)
        @test count(==(lower), truncated_draws) == 0
        @test count(==(lower), censored_draws) > 0
    end

    @testset "MvNormalの共分散が同時生成を決める" begin
        covariance_matrix = [1.0 0.65; 0.65 1.0]
        correlated_distribution = checked_mvnormal(zeros(2), covariance_matrix)
        independent_distribution = checked_mvnormal(zeros(2), Matrix{Float64}(I, 2, 2))
        correlated = rand(Xoshiro(20260814), correlated_distribution, 60_000)
        independent = rand(Xoshiro(20260815), independent_distribution, 60_000)

        @test size(correlated) == (2, 60_000)
        @test cov(correlated_distribution) ≈ covariance_matrix
        @test cor(correlated_distribution) ≈ covariance_matrix
        @test all(isfinite, correlated)
        @test all(isfinite, logpdf(correlated_distribution, correlated))
        @test isapprox(cor(correlated[1, :], correlated[2, :]), 0.65; atol = 0.015)
        @test abs(cor(independent[1, :], independent[2, :])) < 0.015

        for draws in (correlated, independent)
            @test all(abs.(vec(mean(draws; dims = 2))) .< 0.02)
            @test all(abs.(vec(std(draws; dims = 2, corrected = false)) .- 1) .< 0.02)
        end

        correlated_joint = mean((correlated[1, :] .> 1) .& (correlated[2, :] .> 1))
        independent_joint = mean((independent[1, :] .> 1) .& (independent[2, :] .> 1))
        @test correlated_joint > 2 * independent_joint

        @test_throws DimensionMismatch checked_mvnormal(zeros(3), covariance_matrix)
        @test_throws ArgumentError checked_mvnormal(zeros(2), [1.0 0.2; 0.3 1.0])
        @test_throws ArgumentError checked_mvnormal(zeros(2), [1.0 1.2; 1.2 1.0])
        @test_throws PosDefException MvNormal(zeros(2), [1.0 1.2; 1.2 1.0])
    end

    @testset "MixtureModelは既知componentから生成・読解する" begin
        component_distributions = Normal[Normal(450, 25), Normal(650, 30)]
        component_weights = [0.7, 0.3]
        mixture = MixtureModel(component_distributions, component_weights)
        component_means = mean.(component_distributions)
        component_variances = var.(component_distributions)

        @test ncomponents(mixture) == 2
        @test components(mixture) == component_distributions
        @test probs(mixture) ≈ component_weights
        @test mean(mixture) ≈ sum(component_weights .* component_means)
        @test var(mixture) ≈ weighted_mixture_variance(
            component_weights,
            component_means,
            component_variances,
        )

        for x in (430.0, 520.0, 670.0)
            expected_density = sum(component_weights .* pdf.(component_distributions, x))
            @test pdf(mixture, x) ≈ expected_density
            @test isfinite(logpdf(mixture, x))
        end

        draws = rand(Xoshiro(20260816), mixture, 80_000)
        matched_normal = Normal(mean(mixture), std(mixture))
        matched_draws = rand(Xoshiro(20260817), matched_normal, 80_000)
        @test length(draws) == 80_000
        @test all(isfinite, draws)
        @test isapprox(mean(draws), mean(mixture); atol = 1.0)
        @test isapprox(std(draws; corrected = false), std(mixture); atol = 1.0)
        @test mean((520 .< draws) .& (draws .< 580)) < 0.02
        @test mean((520 .< matched_draws) .& (matched_draws .< 580)) > 0.15

        @test !applicable(fit_mle, MixtureModel, draws)
        @test_throws MethodError fit_mle(MixtureModel, draws)
        @test_throws DomainError MixtureModel(component_distributions, [0.8, 0.8])
        @test_throws DomainError MixtureModel(component_distributions, [-0.1, 1.1])
    end

    @testset "乱数列でなく構造と再生成可能性を固定する" begin
        mv = MvNormal(zeros(2), [1.0 0.4; 0.4 1.0])
        mix = MixtureModel(Normal[Normal(-2, 1), Normal(2, 1)], [0.5, 0.5])
        @test rand(Xoshiro(20260818), mv, 100) == rand(Xoshiro(20260818), mv, 100)
        @test rand(Xoshiro(20260819), mix, 100) == rand(Xoshiro(20260819), mix, 100)
        @test size(rand(Xoshiro(1), mv, 7)) == (2, 7)
        @test length(rand(Xoshiro(1), mix, 7)) == 7
        @test all(isfinite, rand(Xoshiro(2), mv, 100))
        @test all(isfinite, rand(Xoshiro(2), mix, 100))
    end
end

println((
    julia = string(VERSION),
    distributions = string(pkgversion(Distributions)),
    contracts = (
        observation_boundary = true,
        covariance = true,
        mixture_generation_only = true,
    ),
))
println("DISTRIBUTION_STRUCTURE_CHECK_PASS")
