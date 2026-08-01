using Tar
using Test

const ROOT = normpath(joinpath(@__DIR__, ".."))
const ARCHIVE = joinpath(ROOT, "public", "templates", "reproducible-study-template.tar")

git_command(repository, arguments...) = Cmd([
    "git",
    "-C",
    repository,
    arguments...,
])

git_read(repository, arguments...) = strip(read(git_command(repository, arguments...), String))

function git_succeeds(repository, arguments...)
    process = run(pipeline(
        ignorestatus(git_command(repository, arguments...));
        stdout = devnull,
        stderr = devnull,
    ); wait = true)
    success(process)
end

@testset "Gitの研究履歴と公開境界" begin
    @test isfile(ARCHIVE)
    @test git_succeeds(ROOT, "--version")

    mktempdir() do extraction
        Tar.extract(ARCHIVE, extraction)
        repository = joinpath(extraction, "reproducible-study")

        private_data = joinpath(repository, "data", "raw", "participants.csv")
        secret_file = joinpath(repository, ".env")
        derived_file = joinpath(repository, "data", "derived", "generated.csv")
        output_file = joinpath(repository, "output", "private-table.csv")
        run_file = joinpath(repository, "metadata", "runs", "local-run.toml")
        for path in [private_data, secret_file, derived_file, output_file, run_file]
            mkpath(dirname(path))
        end
        write(private_data, "participant_id,email\nP999,private@example.invalid\n")
        write(secret_file, "API_TOKEN=LEAK_TEST_TOKEN\n")
        write(derived_file, "private-derived\n")
        write(output_file, "private-output\n")
        write(run_file, "private-run-metadata\n")

        run(git_command(repository, "init", "--quiet", "--initial-branch=main"))
        run(git_command(repository, "config", "user.name", "Curriculum Check"))
        run(git_command(repository, "config", "user.email", "check@example.invalid"))
        run(git_command(repository, "add", "-A"))

        tracked = Set(split(git_read(repository, "ls-files"), '\n'))
        for expected in [
            ".gitignore",
            ".gitattributes",
            "Project.toml",
            "Manifest.toml",
            "data/example/trials_synthetic.csv",
            "data/raw/README.md",
            "metadata/schema.toml",
            "metadata/study.toml",
        ]
            @test expected in tracked
        end
        for forbidden in [
            ".env",
            "data/raw/participants.csv",
            "data/derived/generated.csv",
            "output/private-table.csv",
            "metadata/runs/local-run.toml",
        ]
            @test forbidden ∉ tracked
            ignored_by = git_read(repository, "check-ignore", "-v", forbidden)
            @test occursin(forbidden, replace(ignored_by, '\\' => '/'))
        end
        @test !git_succeeds(repository, "grep", "--cached", "LEAK_TEST_TOKEN")
        @test !git_succeeds(repository, "grep", "--cached", "private@example.invalid")

        run(git_command(repository, "commit", "--quiet", "-m", "Create reproducible study skeleton"))
        @test isempty(git_read(repository, "status", "--short"))

        run(git_command(repository, "switch", "--quiet", "-c", "env-update-test"))
        open(joinpath(repository, "Project.toml"), "a") do io
            write(io, "\n# coordinated environment update check\n")
        end
        open(joinpath(repository, "Manifest.toml"), "a") do io
            write(io, "\n# coordinated environment update check\n")
        end
        changed = git_read(repository, "status", "--short")
        @test occursin("Project.toml", changed)
        @test occursin("Manifest.toml", changed)
        run(git_command(repository, "add", "Project.toml", "Manifest.toml"))
        run(git_command(repository, "commit", "--quiet", "-m", "Update project environment together"))

        run(git_command(
            repository,
            "tag",
            "-a",
            "analysis-v1.0",
            "-m",
            "Validated analysis snapshot",
        ))
        @test git_read(repository, "cat-file", "-t", "analysis-v1.0") == "tag"
        @test git_read(repository, "rev-list", "-n", "1", "analysis-v1.0") ==
              git_read(repository, "rev-parse", "HEAD")
        @test isempty(git_read(repository, "status", "--short"))

        raw_tracked = sort(filter(path -> startswith(path, "data/raw/"), collect(tracked)))
        @test raw_tracked == ["data/raw/README.md"]
    end
end

println((
    git_version = readchomp(`git --version`),
    sensitive_examples_checked = 5,
    branch_and_annotated_tag = true,
))
println("version-control boundary checks passed")
