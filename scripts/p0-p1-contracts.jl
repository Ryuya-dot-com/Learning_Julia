module P0P1Contracts

using CSV
using DataFrames
using Distributions
using LinearAlgebra
using Random
using Statistics

export REQUIRED_COLUMNS,
       TRIAL_TYPES,
       bootstrap_means,
       checked_mvnormal,
       clean_numeric,
       data_summary,
       discover_csvs,
       fit_checked,
       fit_uncensored_checked,
       inside,
       load_trials,
       predictive_interval,
       read_trial_part,
       replicate_summaries,
       validate_trials,
       weighted_mixture_variance,
       write_new_csv

const REQUIRED_COLUMNS = [:participant_id, :trial, :condition, :rt_ms, :correct]
const TRIAL_TYPES = Dict(
    :participant_id => String,
    :trial => Int,
    :condition => String,
    :rt_ms => Float64,
    :correct => Bool,
)

function discover_csvs(input_dir)
    isdir(input_dir) || throw(ArgumentError("input directoryがありません: $input_dir"))
    files = filter(
        path -> isfile(path) && endswith(lowercase(path), ".csv"),
        readdir(input_dir; join = true, sort = true),
    )
    isempty(files) && throw(ArgumentError("CSV fileがありません: $input_dir"))
    files
end

function read_trial_part(path)
    data = CSV.read(
        path,
        DataFrame;
        types = TRIAL_TYPES,
        missingstring = ["", "NA"],
        strict = true,
        validate = true,
    )

    actual = propertynames(data)
    absent = setdiff(REQUIRED_COLUMNS, actual)
    unexpected = setdiff(actual, REQUIRED_COLUMNS)
    if !isempty(absent) || !isempty(unexpected)
        throw(ArgumentError(
            "$(basename(path)): schema不一致 absent=$(absent) unexpected=$(unexpected)",
        ))
    end

    select!(data, REQUIRED_COLUMNS)
    data
end

function validate_trials(data)
    problems = String[]
    any(nonunique(data, [:participant_id, :trial])) &&
        push!(problems, "participant_idとtrialの組が重複しています")

    allowed = Set(["control", "treatment"])
    all(x -> !ismissing(x) && x in allowed, data.condition) ||
        push!(problems, "conditionに未知の値または欠測があります")
    all(x -> ismissing(x) || 100 <= x <= 3000, data.rt_ms) ||
        push!(problems, "rt_msが許容範囲外です")
    all(!ismissing, data.correct) ||
        push!(problems, "correctに欠測があります")

    isempty(problems) || throw(ArgumentError(join(problems, "\n")))
    true
end

function load_trials(input_dir)
    files = discover_csvs(input_dir)
    parts = read_trial_part.(files)
    data = vcat(
        parts...;
        cols = :setequal,
        source = (:source_file => basename.(files)),
    )
    validate_trials(data)
    data, files
end

function write_new_csv(path, table; kwargs...)
    mkpath(dirname(path))
    ispath(path) && throw(ArgumentError("既存の出力を上書きしません: $path"))
    CSV.write(path, table; kwargs...)
end

function clean_numeric(values)
    isempty(values) && throw(ArgumentError("観測が0件です"))
    any(ismissing, values) && throw(ArgumentError("欠測を処理してからfitしてください"))
    cleaned = Float64.(values)
    all(isfinite, cleaned) || throw(ArgumentError("NaNまたはInfを含みます"))
    cleaned
end

function fit_checked(D, values; support = _ -> true)
    cleaned = clean_numeric(values)
    all(support, cleaned) || throw(ArgumentError("候補分布のsupport外です"))
    fitted = fit_mle(D, cleaned)
    all(x -> insupport(fitted, x), cleaned) ||
        throw(ArgumentError("推定後の分布support外です"))
    theoretical = (mean(fitted), std(fitted), quantile(fitted, 0.5), quantile(fitted, 0.95))
    all(isfinite, theoretical) || throw(ArgumentError("理論要約が有限ではありません"))
    fitted
end

function fit_uncensored_checked(D, values, censored_flags; support = _ -> true)
    length(values) == length(censored_flags) ||
        throw(DimensionMismatch("valuesとcensored flagの長さが一致しません"))
    all(flag -> flag isa Bool, censored_flags) ||
        throw(ArgumentError("censored flagはBoolで指定してください"))
    any(censored_flags) && throw(ArgumentError(
        "打切り観測を通常のfit_mleへ渡せません。観測規則を含む専用尤度が必要です",
    ))
    fit_checked(D, values; support)
end

function data_summary(values; lower_cut = 350.0)
    cleaned = clean_numeric(values)
    (
        mean = mean(cleaned),
        sd = std(cleaned; corrected = false),
        zero_rate = count(iszero, cleaned) / length(cleaned),
        below_rate = count(<(lower_cut), cleaned) / length(cleaned),
        q50 = quantile(cleaned, 0.50),
        q95 = quantile(cleaned, 0.95),
        maximum = maximum(cleaned),
    )
end

function replicate_summaries(rng, distribution, sample_size, replicates; lower_cut = 350.0)
    sample_size > 0 || throw(ArgumentError("sample_sizeは正でなければなりません"))
    replicates > 0 || throw(ArgumentError("replicatesは正でなければなりません"))

    result = DataFrame(
        replicate = 1:replicates,
        mean = Vector{Float64}(undef, replicates),
        sd = Vector{Float64}(undef, replicates),
        zero_rate = Vector{Float64}(undef, replicates),
        below_rate = Vector{Float64}(undef, replicates),
        q50 = Vector{Float64}(undef, replicates),
        q95 = Vector{Float64}(undef, replicates),
        maximum = Vector{Float64}(undef, replicates),
    )

    for r in 1:replicates
        summary = data_summary(rand(rng, distribution, sample_size); lower_cut)
        for name in (:mean, :sd, :zero_rate, :below_rate, :q50, :q95, :maximum)
            result[r, name] = getproperty(summary, name)
        end
    end
    result
end

predictive_interval(values) = (
    lower = quantile(values, 0.025),
    median = quantile(values, 0.50),
    upper = quantile(values, 0.975),
)

inside(value, interval) = interval.lower <= value <= interval.upper

function bootstrap_means(rng, D, values, replicates; support = _ -> true)
    cleaned = clean_numeric(values)
    n = length(cleaned)
    [
        mean(fit_checked(D, cleaned[rand(rng, eachindex(cleaned), n)]; support))
        for _ in 1:replicates
    ]
end

function checked_mvnormal(mean_vector, covariance_matrix)
    length(mean_vector) == size(covariance_matrix, 1) == size(covariance_matrix, 2) ||
        throw(DimensionMismatch("meanとcovarianceの次元が一致しません"))
    isapprox(covariance_matrix, covariance_matrix'; atol = 1e-12) ||
        throw(ArgumentError("covarianceは対称でなければなりません"))
    isposdef(Symmetric(covariance_matrix)) ||
        throw(ArgumentError("covarianceは正定値でなければなりません"))
    MvNormal(Float64.(mean_vector), Matrix{Float64}(covariance_matrix))
end

weighted_mixture_variance(weights, component_means, component_variances) = begin
    mixture_mean = sum(weights .* component_means)
    sum(weights .* (component_variances .+ (component_means .- mixture_mean) .^ 2))
end

end
