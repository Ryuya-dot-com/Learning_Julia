using DataFrames
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p0-p1-contracts.jl"))
using .P0P1Contracts

@testset "分布の推定と予測診断" begin
    @testset "入口と推定API" begin
        @test_throws ArgumentError clean_numeric(Float64[])
        @test_throws ArgumentError clean_numeric([1.0, missing])
        @test_throws ArgumentError clean_numeric([1.0, Inf])
        @test_throws ArgumentError fit_checked(LogNormal, [0.0, 1.0]; support = >(0))

        observed = rand(Xoshiro(20260809), LogNormal(log(520), 0.16), 240)
        fitted_by_dispatch = fit(LogNormal, observed)
        fitted_mle = fit_checked(LogNormal, observed; support = >(0))

        @test collect(params(fitted_by_dispatch)) ≈ collect(params(fitted_mle))
        @test all(x -> insupport(fitted_mle, x), observed)
        @test all(isfinite, logpdf.(Ref(fitted_mle), observed))
        @test 480 < mean(fitted_mle) < 560
        @test 0 < std(fitted_mle) < 130

        guarded = fit_uncensored_checked(LogNormal, observed, falses(length(observed)); support = >(0))
        @test collect(params(guarded)) ≈ collect(params(fitted_mle))
        @test_throws DimensionMismatch fit_uncensored_checked(
            LogNormal, observed, falses(length(observed) - 1); support = >(0),
        )
        censored_flags = falses(length(observed))
        censored_flags[1] = true
        @test_throws ArgumentError fit_uncensored_checked(
            LogNormal, observed, censored_flags; support = >(0),
        )
    end

    @testset "点推定・parameter不確かさ・replicate dataを分ける" begin
        observed = rand(Xoshiro(20260809), LogNormal(log(520), 0.16), 240)
        fitted = fit_checked(LogNormal, observed; support = >(0))
        bootstrap = bootstrap_means(Xoshiro(811), LogNormal, observed, 500; support = >(0))
        parameter_interval = predictive_interval(bootstrap)

        @test length(bootstrap) == 500
        @test all(isfinite, bootstrap)
        @test parameter_interval.lower < mean(fitted) < parameter_interval.upper
        @test parameter_interval.upper - parameter_interval.lower > 0

        replicated = replicate_summaries(Xoshiro(812), fitted, length(observed), 1_200)
        @test size(replicated) == (1_200, 8)
        @test replicated.replicate == 1:1_200
        @test all(isfinite, Matrix(select(replicated, Not(:replicate))))

        observed_summary = data_summary(observed)
        for statistic in (:sd, :below_rate, :q50, :q95, :maximum)
            @test inside(
                getproperty(observed_summary, statistic),
                predictive_interval(replicated[!, statistic]),
            )
        end
    end

    @testset "平均だけ合う誤modelを予測で反証する" begin
        observed = rand(Xoshiro(20260809), LogNormal(log(520), 0.16), 240)
        observed_summary = data_summary(observed)
        fitted_lognormal = fit_checked(LogNormal, observed; support = >(0))
        fitted_exponential = fit_checked(Exponential, observed; support = >(0))

        @test mean(fitted_exponential) ≈ observed_summary.mean
        @test isapprox(mean(fitted_lognormal), observed_summary.mean; rtol = 0.01)

        lognormal_rep = replicate_summaries(
            Xoshiro(813), fitted_lognormal, length(observed), 1_200,
        )
        exponential_rep = replicate_summaries(
            Xoshiro(814), fitted_exponential, length(observed), 1_200,
        )

        @test inside(observed_summary.sd, predictive_interval(lognormal_rep.sd))
        @test inside(observed_summary.q50, predictive_interval(lognormal_rep.q50))
        @test !inside(observed_summary.sd, predictive_interval(exponential_rep.sd))
        @test !inside(observed_summary.q50, predictive_interval(exponential_rep.q50))
        @test !inside(observed_summary.below_rate, predictive_interval(exponential_rep.below_rate))
    end

    @testset "過分散countをPoissonの0・分散・裾へ戻す" begin
        counts = rand(Xoshiro(20260810), NegativeBinomial(2, 0.4), 500)
        observed_summary = data_summary(counts; lower_cut = 1.0)
        fitted_poisson = fit_mle(Poisson, counts)
        poisson_rep = replicate_summaries(
            Xoshiro(815), fitted_poisson, length(counts), 1_500; lower_cut = 1.0,
        )

        @test mean(fitted_poisson) ≈ observed_summary.mean
        @test observed_summary.sd^2 > 1.8 * observed_summary.mean
        @test !inside(observed_summary.sd, predictive_interval(poisson_rep.sd))
        @test !inside(observed_summary.zero_rate, predictive_interval(poisson_rep.zero_rate))
        @test !inside(observed_summary.maximum, predictive_interval(poisson_rep.maximum))
        @test all(>=(0), poisson_rep.maximum)
    end

    @testset "乱数の特定列ではなく診断表の性質を固定する" begin
        fitted = Normal(500, 50)
        first_run = replicate_summaries(Xoshiro(816), fitted, 40, 100)
        second_run = replicate_summaries(Xoshiro(816), fitted, 40, 100)
        @test first_run == second_run
        @test first_run.mean != fill(first(first_run.mean), 100)
        @test all(first_run.q50 .<= first_run.q95)
        @test all(first_run.q95 .<= first_run.maximum)
        @test_throws ArgumentError replicate_summaries(Xoshiro(1), fitted, 0, 10)
        @test_throws ArgumentError replicate_summaries(Xoshiro(1), fitted, 10, 0)
    end
end

println((
    julia = string(VERSION),
    distributions = string(pkgversion(Distributions)),
    dataframes = string(pkgversion(DataFrames)),
    checks = (support = true, parameter_uncertainty = true, predictive_replicates = true),
))
println("DISTRIBUTION_FIT_CHECK_PASS")
