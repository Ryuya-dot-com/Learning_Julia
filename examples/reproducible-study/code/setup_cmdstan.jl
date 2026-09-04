using Downloads
using SHA

const PROJECT_ROOT = realpath(normpath(joinpath(@__DIR__, "..")))
const CMDSTAN_VERSION = "2.39.0"
const CMDSTAN_ARCHIVE_SHA256 =
    "ffe03c29c9f139d77deeb156a2a0911ebf0742ae38311c739f4fcea3bc4f8909"
const CMDSTAN_URL =
    "https://github.com/stan-dev/cmdstan/releases/download/v$(CMDSTAN_VERSION)/cmdstan-$(CMDSTAN_VERSION).tar.gz"
const INSTALL_ROOT = joinpath(PROJECT_ROOT, ".cmdstan")
const CMDSTAN_HOME = joinpath(INSTALL_ROOT, "cmdstan-$(CMDSTAN_VERSION)")
const BUILD_PATH_MARKER = joinpath(CMDSTAN_HOME, ".learning-julia-build-path")

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

function required_tools(home)
    suffix = Sys.iswindows() ? ".exe" : ""
    [joinpath(home, "bin", name * suffix) for name in ("stanc", "stansummary", "diagnose")]
end

function installation_complete(home)
    isdir(home) && all(isfile, required_tools(home))
end

function built_at_current_path()
    isfile(BUILD_PATH_MARKER) && strip(read(BUILD_PATH_MARKER, String)) == realpath(CMDSTAN_HOME)
end

function build_jobs()
    value = tryparse(Int, get(ENV, "CMDSTAN_MAKE_JOBS", "2"))
    isnothing(value) && error("CMDSTAN_MAKE_JOBSは整数で指定してください")
    value > 0 || error("CMDSTAN_MAKE_JOBSは1以上にしてください")
    value
end

function install_cmdstan()
    tar = Sys.which("tar")
    make = Sys.which(Sys.iswindows() ? "mingw32-make" : "make")
    Sys.iswindows() && isnothing(make) && (make = Sys.which("make"))
    isnothing(tar) && error("tarが見つかりません")
    isnothing(make) && error("makeが見つかりません")
    mkpath(INSTALL_ROOT)

    if !ispath(CMDSTAN_HOME)
        mktempdir(INSTALL_ROOT) do staging
            archive = joinpath(staging, "cmdstan-$(CMDSTAN_VERSION).tar.gz")
            Downloads.download(CMDSTAN_URL, archive)
            actual_sha256 = file_sha256(archive)
            actual_sha256 == CMDSTAN_ARCHIVE_SHA256 || error(
                "CmdStan archiveのSHA-256が公式release情報と一致しません: $actual_sha256",
            )
            cd(staging) do
                run(Cmd([tar, "-xzf", basename(archive)]))
            end
            staged_home = joinpath(staging, "cmdstan-$(CMDSTAN_VERSION)")
            isfile(joinpath(staged_home, "makefile")) || error(
                "CmdStan archiveのdirectory構成が想定と異なります",
            )
            mv(staged_home, CMDSTAN_HOME)
        end
    end

    isfile(joinpath(CMDSTAN_HOME, "makefile")) || error(
            "CmdStan archiveのdirectory構成が想定と異なります",
    )
    installation_complete(CMDSTAN_HOME) && built_at_current_path() && return :reused

    if installation_complete(CMDSTAN_HOME)
        run(Cmd([make, "-C", CMDSTAN_HOME, "clean-all"]))
    end
    run(Cmd([make, "-C", CMDSTAN_HOME, "-j$(build_jobs())", "build"]))
    installation_complete(CMDSTAN_HOME) || error("CmdStan build後の必須toolが不足しています")
    write(BUILD_PATH_MARKER, realpath(CMDSTAN_HOME) * "\n")
    :built
end

status = install_cmdstan()
stanc = first(required_tools(CMDSTAN_HOME))
println(strip(read(Cmd([stanc, "--version"]), String)))
println((cmdstan = CMDSTAN_HOME, status))
