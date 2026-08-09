#!/usr/bin/env julia

# Verifies the pre-registered, no-telemetry learner usability protocol. This
# script validates only synthetic examples; it does not create or read actual
# participant observations.
using JSON3
using Test

const ROOT = normpath(joinpath(@__DIR__, ".."))
const VALIDATION_DIR = joinpath(ROOT, "validation", "p2-likelihood")
const FIXTURE_DIR = joinpath(VALIDATION_DIR, "fixtures")
const PROTOCOL_PATH = joinpath(VALIDATION_DIR, "LEARNER_USABILITY_PROTOCOL.md")
const OBSERVATION_SCHEMA_PATH = joinpath(
    VALIDATION_DIR, "learner-usability-observation-v1.schema.json",
)
const SUMMARY_SCHEMA_PATH = joinpath(
    VALIDATION_DIR, "learner-usability-round-summary-v1.schema.json",
)
const OBSERVATION_EXAMPLE_PATH = joinpath(
    FIXTURE_DIR, "learner-usability-observation-v1.example.json",
)
const SUMMARY_EXAMPLE_PATH = joinpath(
    FIXTURE_DIR, "learner-usability-round-summary-v1.example.json",
)

const TASK_IDS = Set([
    "denominator",
    "missingness",
    "conditional_vs_count",
    "unresolved_interval",
    "family_scope",
])
const CRITICAL_TASK_IDS = Set(["missingness", "unresolved_interval"])
const FORBIDDEN_DIRECT_IDENTIFIER_KEYS = Set([
    "name",
    "email",
    "phone",
    "address",
    "student_id",
    "ip_address",
    "diagnosis",
    "signature",
    "contact",
    "audio",
    "video",
    "transcript",
    "verbatim_quote",
])

key_strings(value) = Set(String.(collect(keys(value))))

function all_nested_keys!(output, value)
    if value isa AbstractDict || value isa JSON3.Object
        for (key, child) in pairs(value)
            push!(output, String(key))
            all_nested_keys!(output, child)
        end
    elseif value isa AbstractVector || value isa JSON3.Array
        foreach(child -> all_nested_keys!(output, child), value)
    end
    output
end

function task_map(value)
    Dict(String(task.task_id) => task for task in value.task_summaries)
end

function usability_decision(value)
    completed = Int(value.completed_sessions)
    completed < 4 && return :insufficient_evidence
    String(value.round_kind) == "confirmation" &&
        Int(value.cumulative_completed_sessions) < 8 &&
        return :insufficient_evidence

    tasks = task_map(value)
    Set(keys(tasks)) == TASK_IDS || return :revise_retest
    for (task_id, task) in tasks
        attempted = Int(task.attempted)
        independent = Int(task.completed_independently)
        score2 = Int(task.teach_back_score_2)
        attempted == completed || return :revise_retest
        4independent >= 3completed || return :revise_retest
        if task_id in CRITICAL_TASK_IDS
            score2 == completed || return :revise_retest
        else
            4score2 >= 3completed || return :revise_retest
        end
    end

    has_open_high_issue = any(value.issues) do issue
        String(issue.severity) in ("blocker", "major") && String(issue.status) == "open"
    end
    has_open_high_issue && return :revise_retest
    String(value.round_kind) == "confirmation" || return :revise_retest
    Bool(value.keyboard_only_gate_met) || return :revise_retest
    :confirmation_candidate
end

protocol = read(PROTOCOL_PATH, String)
observation_schema = JSON3.read(read(OBSERVATION_SCHEMA_PATH, String))
summary_schema = JSON3.read(read(SUMMARY_SCHEMA_PATH, String))
observation = JSON3.read(read(OBSERVATION_EXAMPLE_PATH, String))
summary = JSON3.read(read(SUMMARY_EXAMPLE_PATH, String))

usability_records = NamedTuple[]
for (directory, _, files) in walkdir(VALIDATION_DIR), file in files
    endswith(file, ".json") || continue
    path = joinpath(directory, file)
    parsed = try
        JSON3.read(read(path, String))
    catch
        continue
    end
    hasproperty(parsed, :schema_id) || continue
    schema_id = String(parsed.schema_id)
    startswith(schema_id, "learning-julia.p2.learner-usability-") || continue
    push!(usability_records, (
        path = relpath(path, ROOT),
        schema_id,
        record_kind = String(parsed.record_kind),
    ))
end
actual_participant_records = count(
    record -> record.record_kind == "private_observation",
    usability_records,
)

@testset "P2 learner usability protocol boundary" begin
    @testset "official-method and no-completion claims" begin
        for contract in [
            "protocol ready / no participant sessions completed / research only",
            "4〜8人",
            "practice session",
            "formative round",
            "confirmation round",
            "今日はあなたではなく教材をテストします",
            "実観察票をrepository／Dropboxへ保存しない",
            "external telemetry、analytics、session replayは導入しない",
            "P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS",
        ]
            @test occursin(contract, protocol)
        end
        for url in [
            "gov.uk/service-manual/user-research/using-moderated-usability-testing",
            "gov.uk/service-manual/user-research/plan-user-research-for-your-service",
            "w3.org/WAI/test-evaluate/involving-users",
            "w3.org/WAI/WCAG22/Understanding/labels-or-instructions",
            "w3.org/WAI/WCAG22/Understanding/error-identification",
        ]
            @test occursin(url, protocol)
        end
        @test occursin("`missingness`または`unresolved_interval`でscore 2が100%未満", protocol)
        @test occursin("いずれかのtaskで`independent`が完了者の75%未満", protocol)
    end

    @testset "versioned schemas" begin
        @test observation_schema[Symbol("\$schema")] ==
            "https://json-schema.org/draft/2020-12/schema"
        @test observation_schema[Symbol("\$id")] ==
            "urn:learning-julia:p2:learner-usability-observation:1"
        @test summary_schema[Symbol("\$id")] ==
            "urn:learning-julia:p2:learner-usability-round-summary:1"
        @test observation_schema.additionalProperties === false
        @test summary_schema.additionalProperties === false
        @test observation_schema.properties.recording.const == "none"
        @test observation_schema.properties.contains_direct_identifiers.const === false
        @test Set(String.(observation_schema.properties.tasks.items.properties.task_id.enum)) == TASK_IDS
        @test Set(String.(summary_schema.properties.task_summaries.items.properties.task_id.enum)) == TASK_IDS
        @test Set(
            String(rule.contains.properties.task_id.const)
            for rule in observation_schema.properties.tasks.allOf
        ) == TASK_IDS
        @test Set(
            String(rule.contains.properties.task_id.const)
            for rule in summary_schema.properties.task_summaries.allOf
        ) == TASK_IDS
        @test all(
            rule.minContains == rule.maxContains == 1
            for rule in observation_schema.properties.tasks.allOf
        )
    end

    @testset "synthetic private observation example" begin
        @test key_strings(observation) == Set(String.(observation_schema.required))
        @test observation.schema_id == "learning-julia.p2.learner-usability-observation"
        @test observation.schema_version == "1.0.0"
        @test observation.record_kind == "synthetic_example"
        @test observation.data_classification == "restricted_research_observation"
        @test observation.contains_direct_identifiers === false
        @test observation.recording == "none"
        @test observation.consent_confirmed === true
        @test occursin(r"^round-[0-9]{2}-p[0-9]{2}$", String(observation.session_code))
        @test Set(String(task.task_id) for task in observation.tasks) == TASK_IDS
        @test length(observation.tasks) == length(TASK_IDS)
        @test all(0 <= task.teach_back_score <= 2 for task in observation.tasks)
        @test all(0 <= task.prompt_count <= 20 for task in observation.tasks)
        nested_keys = all_nested_keys!(Set{String}(), observation)
        @test isempty(intersect(nested_keys, FORBIDDEN_DIRECT_IDENTIFIER_KEYS))
    end

    @testset "repository-safe aggregate and precommitted decision" begin
        @test key_strings(summary) == Set(String.(summary_schema.required))
        @test summary.schema_id == "learning-julia.p2.learner-usability-round-summary"
        @test summary.record_kind == "synthetic_example"
        @test summary.data_classification == "aggregate_without_direct_identifiers"
        @test Set(String(task.task_id) for task in summary.task_summaries) == TASK_IDS
        @test all(
            task.completed_independently <= task.attempted <= summary.completed_sessions &&
            task.teach_back_score_2 <= task.attempted
            for task in summary.task_summaries
        )
        @test usability_decision(summary) == :revise_retest
        @test summary.decision == "revise_retest"

        confirmation_tasks = [(
            task_id = task_id,
            attempted = 4,
            completed_independently = 3,
            teach_back_score_2 = task_id in CRITICAL_TASK_IDS ? 4 : 3,
        ) for task_id in sort!(collect(TASK_IDS))]
        passing_confirmation = (
            round_kind = "confirmation",
            completed_sessions = 4,
            cumulative_completed_sessions = 9,
            task_summaries = confirmation_tasks,
            issues = NamedTuple[],
            keyboard_only_gate_met = true,
        )
        @test usability_decision(passing_confirmation) == :confirmation_candidate
        @test usability_decision(merge(
            passing_confirmation,
            (cumulative_completed_sessions = 7,),
        )) == :insufficient_evidence
        @test usability_decision(merge(
            passing_confirmation,
            (keyboard_only_gate_met = false,),
        )) == :revise_retest
    end

    @testset "repository contains examples, not actual participant records" begin
        usability_fixtures = filter(
            name -> startswith(name, "learner-usability-") && endswith(name, ".json"),
            readdir(FIXTURE_DIR),
        )
        @test Set(usability_fixtures) == Set([
            "learner-usability-observation-v1.example.json",
            "learner-usability-round-summary-v1.example.json",
        ])
        @test length(usability_records) == 2
        @test all(record.record_kind == "synthetic_example" for record in usability_records)
        @test actual_participant_records == 0
        @test !ispath(joinpath(VALIDATION_DIR, "usability-data"))
        @test !ispath(joinpath(VALIDATION_DIR, "learner-usability-data"))
    end
end

println((
    schema_version = "1.0.0",
    fixed_tasks = length(TASK_IDS),
    actual_participant_records,
    example_decision = usability_decision(summary),
    scope = "protocol readiness only; participant research not completed",
))
println("P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS")
