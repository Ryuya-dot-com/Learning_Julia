#!/usr/bin/env julia

# One request per process. The parent server supplies exact request bytes on
# stdin and kills this process when the research deadline expires.
using JSON3

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
include(joinpath(@__DIR__, "p2-selection-count-report-io.jl"))
include(joinpath(@__DIR__, "p2-selection-count-api-core.jl"))
using .P2SelectionCountAPICore

bytes = read(stdin)
request = JSON3.read(bytes)
response = execute_api_request(request; exact_request_bytes = bytes)
JSON3.write(stdout, response)
