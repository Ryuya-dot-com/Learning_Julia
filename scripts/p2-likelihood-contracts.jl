module P2LikelihoodContracts

using ADTypes: AutoForwardDiff
using Distributions
using ForwardDiff
using LinearAlgebra
using Optim
using Statistics

export fit_censored_normal,
       fit_selection_count_normal,
       fit_truncated_normal,
       interval95,
       interval_contains,
       likelihood_geometry,
       log_selection_probability,
       normal_censored_nll,
       normal_initial,
       normal_selection_count_nll,
       normal_truncated_nll,
       profile_likelihood_intervals,
       simulate_censored,
       two_sided_scale_contrast,
       two_sided_truncation_assessment,
       validate_censored_sample,
       validate_selection_count_sample,
       validate_truncated_sample,
       weak_identification_assessment,
       wald_intervals

function validate_censored_sample(observed, left_censored, right_censored, lower, upper)
    n = length(observed)
    n > 0 || throw(ArgumentError("観測が0件です"))
    length(left_censored) == n == length(right_censored) ||
        throw(DimensionMismatch("観測値とcensor flagの長さが一致しません"))
    lower < upper || throw(ArgumentError("lowerはupperより小さくしてください"))
    all(isfinite, observed) || throw(ArgumentError("観測値にNaNまたはInfがあります"))
    all(flag -> flag isa Bool, left_censored) ||
        throw(ArgumentError("left_censoredはBoolで指定してください"))
    all(flag -> flag isa Bool, right_censored) ||
        throw(ArgumentError("right_censoredはBoolで指定してください"))
    any(left_censored .& right_censored) &&
        throw(ArgumentError("同じ観測を左右同時に打切りにはできません"))

    uncensored = .!left_censored .& .!right_censored
    all(observed[left_censored] .== lower) ||
        throw(ArgumentError("左打切り観測はlowerに記録してください"))
    all(observed[right_censored] .== upper) ||
        throw(ArgumentError("右打切り観測はupperに記録してください"))
    all((observed[uncensored] .> lower) .& (observed[uncensored] .< upper)) ||
        throw(ArgumentError("通常観測は境界の内側に置いてください"))
    count(uncensored) >= 2 ||
        throw(ArgumentError("parameter識別のため通常観測が少なくとも2件必要です"))
    true
end

function normal_censored_nll(raw, observed, left_censored, right_censored, lower, upper)
    distribution = Normal(raw[1], exp(raw[2]))
    total = zero(eltype(raw))
    for i in eachindex(observed)
        total += if left_censored[i]
            logcdf(distribution, lower)
        elseif right_censored[i]
            logccdf(distribution, upper)
        else
            logpdf(distribution, observed[i])
        end
    end
    -total
end

function validate_truncated_sample(observed, lower, upper)
    isempty(observed) && throw(ArgumentError("観測が0件です"))
    lower < upper || throw(ArgumentError("lowerはupperより小さくしてください"))
    all(isfinite, observed) || throw(ArgumentError("観測値にNaNまたはInfがあります"))
    all((observed .> lower) .& (observed .< upper)) ||
        throw(ArgumentError("truncated sampleは境界の内側に限ります"))
    length(observed) >= 2 || throw(ArgumentError("parameter識別には2件以上必要です"))
    true
end

function log_selection_probability(distribution, lower, upper)
    if isfinite(lower) && isfinite(upper)
        location = mean(distribution)
        if upper <= location
            log_upper = logcdf(distribution, upper)
            log_upper + log1p(-exp(logcdf(distribution, lower) - log_upper))
        elseif lower >= location
            log_lower = logccdf(distribution, lower)
            log_lower + log1p(-exp(logccdf(distribution, upper) - log_lower))
        else
            log1p(-(cdf(distribution, lower) + ccdf(distribution, upper)))
        end
    elseif isfinite(lower)
        logccdf(distribution, lower)
    elseif isfinite(upper)
        logcdf(distribution, upper)
    else
        zero(mean(distribution))
    end
end

function log_complement_probability(log_probability)
    log_probability <= zero(log_probability) ||
        throw(ArgumentError("log_probabilityは0以下にしてください"))
    log_probability < -0.6931471805599453 ?
        log1p(-exp(log_probability)) : log(-expm1(log_probability))
end

function normal_truncated_nll(raw, observed, lower, upper)
    distribution = Normal(raw[1], exp(raw[2]))
    log_selection = log_selection_probability(distribution, lower, upper)
    -(sum(logpdf(distribution, value) for value in observed) - length(observed) * log_selection)
end

function validate_selection_count_sample(observed, total_screened, lower, upper)
    isfinite(lower) && isfinite(upper) ||
        throw(ArgumentError("selection count尤度には有限のlowerとupperが必要です"))
    total_screened isa Integer && !(total_screened isa Bool) ||
        throw(ArgumentError("total_screenedは整数で指定してください"))
    total_screened >= length(observed) ||
        throw(ArgumentError("total_screenedは選択数以上にしてください"))
    validate_truncated_sample(observed, lower, upper)
end

function normal_selection_count_nll(raw, observed, total_screened, lower, upper)
    distribution = Normal(raw[1], exp(raw[2]))
    log_selection = log_selection_probability(distribution, lower, upper)
    excluded = total_screened - length(observed)
    excluded_log_probability = excluded == 0 ? zero(eltype(raw)) :
        excluded * log_complement_probability(log_selection)
    -(sum(logpdf(distribution, value) for value in observed) + excluded_log_probability)
end

function validate_raw_initial(initial_raw)
    length(initial_raw) == 2 ||
        throw(ArgumentError("initial_rawは[mu, log_sigma]の2要素で指定してください"))
    all(isfinite, initial_raw) ||
        throw(ArgumentError("initial_rawにNaNまたはInfは指定できません"))
    Float64.(initial_raw)
end

function finish_normal_fit(objective, initial_raw)
    result = optimize(
        objective,
        initial_raw,
        BFGS(),
        Optim.Options(iterations = 2_000, g_tol = 1e-8, store_trace = false);
        autodiff = AutoForwardDiff(),
    )
    Optim.converged(result) || throw(ErrorException("likelihood optimizationが収束しませんでした"))
    raw = Optim.minimizer(result)
    hessian = ForwardDiff.hessian(objective, raw)
    isposdef(Symmetric(hessian)) ||
        throw(ErrorException("observed Hessianが正定値ではありません"))
    covariance_raw = inv(Symmetric(hessian))
    (
        distribution = Normal(raw[1], exp(raw[2])),
        raw = raw,
        covariance_raw = Matrix(covariance_raw),
        result = result,
    )
end

function finish_best_normal_fit(objective, initial_candidates)
    fits = Any[]
    for initial in initial_candidates
        try
            push!(fits, finish_normal_fit(objective, initial))
        catch
            # A finite truncation interval can create a nearly uniform plateau.
            # Keep the failed start visible through the all-failed error below,
            # but select by the actual objective when another start is regular.
        end
    end
    isempty(fits) &&
        throw(ErrorException("すべてのlikelihood初期値でregularな解を得られませんでした"))
    argmin(fit -> Optim.minimum(fit.result), fits)
end

function normal_initial(values)
    location = mean(values)
    scale = std(values; corrected = false)
    isfinite(location) && isfinite(scale) && scale > sqrt(eps(Float64)) ||
        throw(ArgumentError("初期scaleを識別できる変動がありません"))
    [location, log(scale)]
end

function finite_interval_initial_candidates(observed, lower, upper)
    width = upper - lower
    center = (lower + upper) / 2
    [
        normal_initial(observed),
        [mean(observed), log(width / 2)],
        [center, log(width)],
        [center, log(2width)],
        [center, log(4width)],
    ]
end

function fit_censored_normal(
    observed,
    left_censored,
    right_censored,
    lower,
    upper;
    initial_raw = nothing,
)
    validate_censored_sample(observed, left_censored, right_censored, lower, upper)
    uncensored = .!left_censored .& .!right_censored
    initial = isnothing(initial_raw) ?
        normal_initial(observed[uncensored]) : validate_raw_initial(initial_raw)
    objective = raw -> normal_censored_nll(
        raw, observed, left_censored, right_censored, lower, upper,
    )
    finish_normal_fit(objective, initial)
end

function fit_truncated_normal(
    observed;
    lower = -Inf,
    upper = Inf,
    initial_raw = nothing,
)
    validate_truncated_sample(observed, lower, upper)
    objective = raw -> normal_truncated_nll(raw, observed, lower, upper)
    if !isnothing(initial_raw)
        return finish_normal_fit(objective, validate_raw_initial(initial_raw))
    end

    default_initial = normal_initial(observed)
    if isfinite(lower) && isfinite(upper)
        return finish_best_normal_fit(
            objective, finite_interval_initial_candidates(observed, lower, upper),
        )
    end
    finish_normal_fit(objective, default_initial)
end

function fit_selection_count_normal(
    observed,
    total_screened;
    lower,
    upper,
    initial_raw = nothing,
)
    validate_selection_count_sample(observed, total_screened, lower, upper)
    objective = raw -> normal_selection_count_nll(
        raw, observed, total_screened, lower, upper,
    )
    if !isnothing(initial_raw)
        return finish_normal_fit(objective, validate_raw_initial(initial_raw))
    end
    finish_best_normal_fit(
        objective, finite_interval_initial_candidates(observed, lower, upper),
    )
end

function wald_intervals(fit; level = 0.95)
    level == 0.95 || throw(ArgumentError("feasibility checkでは95%区間だけを検証します"))
    z = 1.959963984540054
    se_mu = sqrt(fit.covariance_raw[1, 1])
    se_log_sigma = sqrt(fit.covariance_raw[2, 2])
    (
        mu = (fit.raw[1] - z * se_mu, fit.raw[1] + z * se_mu),
        sigma = (
            exp(fit.raw[2] - z * se_log_sigma),
            exp(fit.raw[2] + z * se_log_sigma),
        ),
    )
end

function likelihood_geometry(fit; observation = :complete, lower = -Inf, upper = Inf)
    observation in (:complete, :censored, :truncated) ||
        throw(ArgumentError("observationは:complete、:censored、:truncatedから選んでください"))
    lower < upper || throw(ArgumentError("lowerはupperより小さくしてください"))

    sigma = std(fit.distribution)
    inverse_scale = Diagonal([inv(sigma), 1.0])
    scaled_covariance = Symmetric(
        inverse_scale * fit.covariance_raw * inverse_scale,
    )
    eigenvalues = eigvals(scaled_covariance)
    all(isfinite, eigenvalues) && all(>(0), eigenvalues) ||
        throw(ErrorException("scaled covarianceが正定値ではありません"))
    covariance_correlation = scaled_covariance[1, 2] /
        sqrt(scaled_covariance[1, 1] * scaled_covariance[2, 2])

    selection_probability = observation == :truncated ?
        exp(log_selection_probability(fit.distribution, lower, upper)) : missing
    boundary_probability = observation == :censored ?
        cdf(fit.distribution, lower) + ccdf(fit.distribution, upper) : missing
    (
        scaled_condition_number = maximum(eigenvalues) / minimum(eigenvalues),
        covariance_correlation = covariance_correlation,
        relative_se_mu = sqrt(fit.covariance_raw[1, 1]) / sigma,
        se_log_sigma = sqrt(fit.covariance_raw[2, 2]),
        selection_probability = selection_probability,
        boundary_probability = boundary_probability,
    )
end

function weak_identification_assessment(
    fit;
    observation = :complete,
    lower = -Inf,
    upper = Inf,
    condition_limit = 1e4,
    correlation_limit = 0.995,
    relative_se_mu_limit = 5.0,
    se_log_sigma_limit = 0.75,
    selection_probability_floor = 1e-2,
)
    geometry = likelihood_geometry(fit; observation, lower, upper)
    reasons = Symbol[]
    geometry.scaled_condition_number > condition_limit && push!(reasons, :ill_conditioned)
    abs(geometry.covariance_correlation) > correlation_limit &&
        push!(reasons, :near_perfect_parameter_correlation)
    geometry.relative_se_mu > relative_se_mu_limit && push!(reasons, :location_uncertainty)
    geometry.se_log_sigma > se_log_sigma_limit && push!(reasons, :scale_uncertainty)
    observation == :truncated &&
        geometry.selection_probability < selection_probability_floor &&
        push!(reasons, :vanishing_selection_probability)
    (
        status = isempty(reasons) ? :regular : :warning,
        reasons = reasons,
        geometry = geometry,
    )
end

function two_sided_scale_contrast(
    observed,
    fit,
    lower,
    upper;
    reference_scale_factor = 1.0,
)
    isfinite(lower) && isfinite(upper) ||
        throw(ArgumentError("両側truncationには有限のlowerとupperが必要です"))
    reference_scale_factor > 0 ||
        throw(ArgumentError("reference_scale_factorは正にしてください"))
    validate_truncated_sample(observed, lower, upper)
    objective = raw -> normal_truncated_nll(raw, observed, lower, upper)
    reference_sigma = reference_scale_factor * (upper - lower)
    reference_nll = profile_minimum(
        objective, fit, 2, log(reference_sigma),
    )
    fitted_nll = Optim.minimum(fit.result)
    nll_delta = reference_nll - fitted_nll
    nll_delta >= -1e-5 ||
        throw(ErrorException("広いscaleのprofileが元のfitより低い尤度を発見しました"))
    (
        reference_sigma = reference_sigma,
        nll_delta = max(nll_delta, 0.0),
        likelihood_ratio = 2max(nll_delta, 0.0),
    )
end

function two_sided_truncation_assessment(
    observed,
    fit,
    lower,
    upper;
    level = 0.95,
    reference_scale_factors = (1.0, 2.0, 4.0),
)
    0 < level < 1 || throw(ArgumentError("levelは0と1の間にしてください"))
    isempty(reference_scale_factors) &&
        throw(ArgumentError("reference_scale_factorsは1つ以上指定してください"))
    base = weak_identification_assessment(
        fit; observation = :truncated, lower, upper,
    )
    contrasts = [
        two_sided_scale_contrast(
            observed,
            fit,
            lower,
            upper;
            reference_scale_factor = factor,
        )
        for factor in reference_scale_factors
    ]
    contrast = argmin(item -> item.likelihood_ratio, contrasts)
    cutoff = quantile(Chisq(1), level)
    reasons = copy(base.reasons)
    contrast.likelihood_ratio <= cutoff &&
        push!(reasons, :wide_scale_profile_compatible)
    (
        status = isempty(reasons) ? :regular : :warning,
        reasons = reasons,
        geometry = base.geometry,
        scale_contrast = contrast,
        scale_contrasts = contrasts,
        likelihood_ratio_cutoff = cutoff,
    )
end

function profile_minimum(objective, fit, fixed_index, fixed_value; nuisance_factor = 1e3)
    fixed_index in (1, 2) || throw(ArgumentError("fixed_indexは1または2にしてください"))
    nuisance_index = 3 - fixed_index
    nuisance_center = fit.raw[nuisance_index]
    nuisance_span = nuisance_index == 1 ?
        nuisance_factor * std(fit.distribution) : log(nuisance_factor)
    nuisance_lower = nuisance_center - nuisance_span
    nuisance_upper = nuisance_center + nuisance_span
    profiled = nuisance -> objective(
        fixed_index == 1 ? [fixed_value, nuisance] : [nuisance, fixed_value],
    )
    result = optimize(
        profiled,
        nuisance_lower,
        nuisance_upper,
        Brent();
        iterations = 500,
        rel_tol = 1e-10,
        abs_tol = 1e-10,
    )
    Optim.converged(result) ||
        throw(ErrorException("profile nuisance optimizationが収束しませんでした"))
    Optim.minimum(result)
end

function profile_endpoint(
    objective,
    fit,
    fixed_index,
    direction,
    target;
    max_expansions = 14,
)
    direction in (-1, 1) || throw(ArgumentError("directionは-1または1にしてください"))
    center = fit.raw[fixed_index]
    raw_se = sqrt(fit.covariance_raw[fixed_index, fixed_index])
    minimum_step = fixed_index == 1 ?
        sqrt(eps(Float64)) * max(abs(center), std(fit.distribution), 1.0) : 1e-4
    step = max(raw_se, minimum_step)
    fit_minimum = Optim.minimum(fit.result)
    inside = center

    for _ in 1:max_expansions
        outside = center + direction * step
        profile_delta = profile_minimum(objective, fit, fixed_index, outside) - fit_minimum
        profile_delta < -1e-5 &&
            throw(ErrorException("profile探索が元のfitより低い尤度を発見しました"))
        if profile_delta >= target
            for _ in 1:45
                midpoint = (inside + outside) / 2
                midpoint_delta = profile_minimum(
                    objective, fit, fixed_index, midpoint,
                ) - fit_minimum
                if midpoint_delta < target
                    inside = midpoint
                else
                    outside = midpoint
                end
            end
            return outside
        end
        inside = outside
        step *= 1.8
    end
    missing
end

function profile_likelihood_intervals(
    objective,
    fit;
    level = 0.95,
    assessment = nothing,
)
    0 < level < 1 || throw(ArgumentError("levelは0と1の間にしてください"))
    if !isnothing(assessment) && assessment.status != :regular
        return (
            status = :skipped_weak_identification,
            mu = (missing, missing),
            sigma = (missing, missing),
            bounded = (mu = false, sigma = false),
        )
    end

    target = quantile(Chisq(1), level) / 2
    mu_lower = profile_endpoint(objective, fit, 1, -1, target)
    mu_upper = profile_endpoint(objective, fit, 1, 1, target)
    log_sigma_lower = profile_endpoint(objective, fit, 2, -1, target)
    log_sigma_upper = profile_endpoint(objective, fit, 2, 1, target)
    (
        status = all(!ismissing, (mu_lower, mu_upper, log_sigma_lower, log_sigma_upper)) ?
            :ok : :search_limit,
        mu = (mu_lower, mu_upper),
        sigma = (
            ismissing(log_sigma_lower) ? missing : exp(log_sigma_lower),
            ismissing(log_sigma_upper) ? missing : exp(log_sigma_upper),
        ),
        bounded = (
            mu = !ismissing(mu_lower) && !ismissing(mu_upper),
            sigma = !ismissing(log_sigma_lower) && !ismissing(log_sigma_upper),
        ),
    )
end

interval_contains(interval, truth) = interval[1] <= truth <= interval[2]

function simulate_censored(rng, distribution, n, lower, upper)
    latent = rand(rng, distribution, n)
    left_censored = latent .<= lower
    right_censored = latent .>= upper
    observed = clamp.(latent, lower, upper)
    observed, left_censored, right_censored
end

function interval95(values)
    bounds = quantile(values, [0.025, 0.975])
    (bounds[1], bounds[2])
end

end
