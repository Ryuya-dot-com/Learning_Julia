using SHA
using Tar

const ROOT = normpath(joinpath(@__DIR__, ".."))
const SOURCE = joinpath(ROOT, "examples", "reproducible-study")
const ARCHIVE = joinpath(ROOT, "public", "templates", "reproducible-study-template.tar")
const TEMPLATE_FILES = [
    ".gitignore",
    ".gitattributes",
    "README.md",
    "Project.toml",
    "Manifest.toml",
    "code/run_analysis.jl",
    "data/example/trials_synthetic.csv",
    "data/raw/README.md",
    "metadata/data_dictionary.csv",
    "metadata/schema.toml",
    "metadata/study.toml",
    "metadata/DATA_LICENSE.txt",
]

function file_sha256(path)
    open(path, "r") do io
        bytes2hex(sha256(io))
    end
end

all(isfile(joinpath(SOURCE, path)) for path in TEMPLATE_FILES) || error(
    "template sourceに必要fileがありません",
)
startswith(normpath(ARCHIVE), joinpath(ROOT, "public", "templates")) || error(
    "archive出力先がpublic/templates外です",
)

mkpath(dirname(ARCHIVE))
mktempdir() do staging
    staged_root = joinpath(staging, "reproducible-study")
    for relative_path in TEMPLATE_FILES
        source = joinpath(SOURCE, relative_path)
        destination = joinpath(staged_root, relative_path)
        mkpath(dirname(destination))
        cp(source, destination)
    end

    mktempdir() do output_directory
        candidate = joinpath(output_directory, "reproducible-study-template.tar")
        Tar.create(staging, candidate)

        status = if isfile(ARCHIVE) && read(ARCHIVE) == read(candidate)
            :reused
        else
            cp(candidate, ARCHIVE; force = true)
            :created
        end
        println((
            archive = relpath(ARCHIVE, ROOT),
            files = length(TEMPLATE_FILES),
            sha256 = file_sha256(ARCHIVE),
            status,
        ))
    end
end
