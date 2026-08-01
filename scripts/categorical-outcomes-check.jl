using Test
using CategoricalArrays
using DataFrames
using RDatasets
using OrdinalMultinomialModels
import MultinomialRegression

@testset "順序・多項ロジスティック回帰" begin
    @testset "順序ロジット（比例オッズ）" begin
        housing = dataset("MASS", "housing")
        levels!(housing.Sat, ["Low", "Medium", "High"])
        levels!(housing.Infl, ["Low", "Medium", "High"])
        levels!(housing.Type, ["Tower", "Apartment", "Atrium", "Terrace"])
        levels!(housing.Cont, ["Low", "High"])

        ordinal_fit = polr(
            @formula(Sat ~ Infl + Type + Cont),
            housing;
            wts=Float64.(housing.Freq),
        )
        ordinal_prob = Matrix(predict_p(ordinal_fit, housing))
        ordinal_coef = coef(ordinal_fit)

        @test size(ordinal_prob) == (nrow(housing), 3)
        @test all(isapprox.(vec(sum(ordinal_prob; dims=2)), 1.0; atol=1e-10))
        @test all(ordinal_prob .>= 0.0)
        @test ordinal_coef[1] < ordinal_coef[2]  # 閾値は順序制約を満たす
        @test isapprox(deviance(ordinal_fit), 3479.1493; atol=1e-2)
        @test all(isfinite, stderror(ordinal_fit))
        println((
            ordinal_thresholds=round.(ordinal_coef[1:2]; digits=3),
            ordinal_first_probability=round.(ordinal_prob[1, :]; digits=3),
            ordinal_deviance=round(deviance(ordinal_fit); digits=3),
        ))
    end

    @testset "名義尺度の多項ロジットと参照カテゴリ" begin
        iris_a = dataset("datasets", "iris")
        levels!(iris_a.Species, ["setosa", "versicolor", "virginica"])
        fit_a = MultinomialRegression.fit(
            @formula(Species ~ 1 + SepalWidth),
            iris_a,
        )

        xnew = [1.0, iris_a.SepalWidth[1]]
        prob_a = MultinomialRegression.predict(fit_a, xnew)

        iris_b = copy(iris_a)
        levels!(iris_b.Species, ["virginica", "versicolor", "setosa"])
        fit_b = MultinomialRegression.fit(
            @formula(Species ~ 1 + SepalWidth),
            iris_b,
        )
        prob_b = MultinomialRegression.predict(fit_b, xnew)
        reorder_b = [findfirst(==(level), fit_b.ylevels) for level in fit_a.ylevels]

        @test fit_a.ylevels[1] == "setosa"
        @test fit_b.ylevels[1] == "virginica"
        @test isapprox(sum(prob_a), 1.0; atol=1e-12)
        @test isapprox(prob_a, prob_b[reorder_b]; atol=1e-7)
        @test !isapprox(
            Matrix(MultinomialRegression.coef(fit_a)),
            Matrix(MultinomialRegression.coef(fit_b));
            atol=1e-3,
        )
        @test all(isfinite, MultinomialRegression.stderror(fit_a))
        @test isfinite(MultinomialRegression.aic(fit_a))
        println((
            multinomial_reference_a=fit_a.ylevels[1],
            multinomial_reference_b=fit_b.ylevels[1],
            probability_a=round.(prob_a; digits=6),
            probability_b_reordered=round.(prob_b[reorder_b]; digits=6),
            coefficients_a=round.(Matrix(MultinomialRegression.coef(fit_a)); digits=3),
            coefficients_b=round.(Matrix(MultinomialRegression.coef(fit_b)); digits=3),
        ))
    end
end

println("categorical outcome checks passed")
