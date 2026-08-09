#!/usr/bin/env julia

# Starts only the synthetic-fixture loopback service. This command never binds
# to a LAN interface and does not provide production authentication.
include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
include(joinpath(@__DIR__, "p2-selection-count-report-io.jl"))
include(joinpath(@__DIR__, "p2-selection-count-api-core.jl"))
include(joinpath(@__DIR__, "p2-selection-count-local-server.jl"))
using .P2SelectionCountLocalServer

function option(name, default)
    prefix = "--$(name)="
    matches = filter(argument -> startswith(argument, prefix), ARGS)
    length(matches) <= 1 || error("$(name)は一度だけ指定してください")
    isempty(matches) ? default : only(matches)[(lastindex(prefix) + 1):end]
end

allowed_arguments = Set(("port", "allowed-origin", "worker-timeout"))
for argument in ARGS
    startswith(argument, "--") || error("位置引数は使えません: $(argument)")
    name = first(split(argument[3:end], '='; limit = 2))
    name in allowed_arguments || error("未登録optionです: $(name)")
end

port = parse(Int, option("port", "43923"))
allowed_origin = option("allowed-origin", "http://127.0.0.1:43922")
worker_timeout = parse(Float64, option("worker-timeout", "120"))
occursin(r"^http://127\.0\.0\.1:[1-9][0-9]{0,4}$", allowed_origin) ||
    error("allowed-originはloopback HTTP originに限定します")

state = LocalServerState(worker_timeout_seconds = worker_timeout)
handle = start_local_server(
    port = port,
    allowed_origin = allowed_origin,
    state = state,
)
println(
    "P2_LOCAL_API_READY origin=", handle.origin,
    " allowed_origin=", handle.state.allowed_origin,
    " scope=synthetic_fixture_only",
)
flush(stdout)

try
    wait(handle.server)
finally
    stop_local_server(handle)
end
