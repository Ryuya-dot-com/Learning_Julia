### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# ╔═╡ 85cbdc56-8c9c-11f1-abb5-69c4daefa418
begin
    using CSV, DataFrames, Statistics
end

# ╔═╡ 85cad2ac-8c9c-11f1-b10f-09471d933726
md"""
# NB1: データ操作編の演習ノート

**はじめてのJulia — STEP 1（「ドット記法(ブロードキャスト)」から「グループ集計と結合」まで）の実践編**です（自由課題で「縦横変換と一括読み込み」の内容も使えます）。

このノートブックは Pluto で動いています(推奨: Julia 1.12系)。セルの中身を書きかえると、関係するセルが**自動で再計算**されます。`# TODO` のセルを書きかえて、下の判定セルが ✅ になったらクリアです。

データはストループ課題ふうの反応時間データ(12試行×4列)。**CSVファイルがこのノートと同じフォルダにあればそれを読み、なければサイトから自動ダウンロードします**(初回はネット接続とパッケージ準備で数分かかります)。
"""

# ╔═╡ 85cbdc9c-8c9c-11f1-a8f4-01565d52ac7f
df = begin
    path = isfile("rt_data.csv") ? "rt_data.csv" :
        download("https://ryuya-dot-com.github.io/Learning_Julia/data/rt_data.csv")
    CSV.read(path, DataFrame)
end

# ╔═╡ 85cbdca6-8c9c-11f1-aa0b-4716175106e1
md"""
## 課題1: ドット記法（「ドット記法(ブロードキャスト)」）

`df.rt` はミリ秒です。1000で割って**秒**の配列 `sec` を作りましょう。
"""

# ╔═╡ 85cbdcb0-8c9c-11f1-88ae-8526772d05c9
sec = missing # TODO: df.rt を 1000 で割って秒に(ドット記法)

# ╔═╡ 85cbdcbc-8c9c-11f1-9faa-79923ae87e85
if sec === missing
    md"⏳ 上のセルの `missing` を、ドット記法の式に書きかえましょう。"
elseif length(sec) == 12 && isapprox(sec[1], 0.5125)
    md"✅ **正解!** 12試行ぜんぶが一気に変換されました。"
else
    md"🤔 おしい。1000で割って、12個の値になっていますか? 「ドット記法(ブロードキャスト)」を見返しましょう。"
end

# ╔═╡ 85cbdcc4-8c9c-11f1-a9c8-c113e8845208
md"""
## 課題2: 行の絞りこみ（「CSV.jl & DataFrames.jl 入門」）

600ミリ秒をこえた「遅い試行」だけの表 `slow` を作りましょう。
"""

# ╔═╡ 85cbdcce-8c9c-11f1-96d4-f174738d5c68
slow = missing # TODO: df[条件, :] の形で（「CSV.jl & DataFrames.jl 入門」の「行を絞りこむ」）

# ╔═╡ 85cbdcd8-8c9c-11f1-a1cc-bb3216fa38dc
if slow === missing
    md"⏳ 「rt列が600をこえる」を条件にします。書き方は「CSV.jl & DataFrames.jl 入門」を見返しましょう。"
elseif slow isa DataFrame && nrow(slow) == 2 && minimum(slow.rt) > 600
    md"✅ **正解!** 遅い試行は2つだけでした。"
else
    md"🤔 行数か中身が合いません。条件は「rt が 600 をこえる」です。"
end

# ╔═╡ 85cbdce2-8c9c-11f1-a483-dba8f738141e
md"""
## 課題3: 内包表記（「内包表記」）

`"s1"` から `"s5"` までのファイル名ふうの文字列配列 `names5` を、内包表記1行で作りましょう。
"""

# ╔═╡ 85cbdcee-8c9c-11f1-9a7f-b1d7ce711896
names5 = missing # TODO: ["s" * string(i) for i in ...] の形で

# ╔═╡ 85cbdcf6-8c9c-11f1-a6ad-61ec0604c0fb
if names5 === missing
    md"⏳ 「内包表記」の最後のページと同じ形です。"
elseif names5 == ["s1", "s2", "s3", "s4", "s5"]
    md"✅ **正解!** 30人分でも数字を変えるだけですね。"
else
    md"🤔 中身が違うようです。`1:5` になっていますか?"
end

# ╔═╡ 85cbdd00-8c9c-11f1-ae3e-15c1d8849bf7
md"""
## 課題4: 条件ごとの平均（「グループ集計と結合」）

`groupby` と `combine` で、条件(`:cond`)ごとの平均反応時間の表 `m` を作りましょう。平均の列名は `:rt_mean` にします。
"""

# ╔═╡ 85cbdd14-8c9c-11f1-b1bc-07c3f95fc74c
m = missing # TODO: combine(groupby(df, ...), ...) の骨組みを埋める

# ╔═╡ 85cbdd1c-8c9c-11f1-b13c-95793d40329c
if m === missing
    md"⏳ 「まとめて、要約する」の2段構えです。「グループ集計と結合」の最初のコード例が手本です。"
elseif m isa DataFrame && nrow(m) == 2 && hasproperty(m, :rt_mean) && isapprox(sort(m.rt_mean)[1], 507.93333333; atol = 0.01)
    md"✅ **正解!** 不一致条件のほうが約83ミリ秒遅い——ストループ効果です。"
elseif m isa DataFrame && !hasproperty(m, :rt_mean)
    md"🤔 表はできていますが、平均の列名が `rt_mean` になっていません。`:rt => mean => :rt_mean` の最後の部分が列名の指定です。"
else
    md"🤔 形は合っていますか? 2行×2列(cond, rt_mean)になるはずです。"
end

# ╔═╡ 85cbdd28-8c9c-11f1-a7b5-bd3c929e87e4
md"""
## 課題5: 欠損の扱い（「辞書と欠損値」）

参加者の属性表 `info` を読みこんであります。**欠損を飛ばした**平均年齢 `age_mean` を出しましょう。
"""

# ╔═╡ 85cbdd32-8c9c-11f1-b26f-dba267591fc8
info = begin
    p = isfile("participants.csv") ? "participants.csv" :
        download("https://ryuya-dot-com.github.io/Learning_Julia/data/participants.csv")
    CSV.read(p, DataFrame)
end

# ╔═╡ 85cbdd46-8c9c-11f1-9b42-479a94ffd960
age_mean = missing # TODO: mean と skipmissing で info.age の平均を

# ╔═╡ 85cbdd4e-8c9c-11f1-ac3e-2b312db1de1e
if age_mean === missing
    md"⏳ 欠損が1人ぶんあります。そのまま mean するとどうなるのでしたっけ?"
elseif age_mean == 22.0
    md"✅ **正解!** skipmissing で欠損を飛ばした平均は22歳です。"
else
    md"🤔 `mean(skipmissing(◯◯))` の形を見返しましょう。"
end

# ╔═╡ 85cbdd5a-8c9c-11f1-afac-b7726c78e252
md"""
## おつかれさまでした!

5課題すべて ✅ になったら、STEP 1 は卒業です。自由課題もどうぞ:

- `leftjoin(df, info, on = :id)` で2つの表を合体して、`group` ごとの平均反応時間を出す（「グループ集計と結合」）
- 課題4の表 `m` を `unstack` で横持ちにしてみる（「縦横変換と一括読み込み」）

続きは学習ロードマップの STEP 2(統計・可視化編)で。
"""

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CSV = "336ed68f-0bac-5ca0-87d4-7b16caf5d00b"
DataFrames = "a93c6f00-e57d-5684-b7b6-d8193f3e46c0"
Statistics = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"

[compat]
CSV = "~0.10.16"
DataFrames = "~1.8.2"
"""

# ╔═╡ 00000000-0000-0000-0000-000000000002
PLUTO_MANIFEST_TOML_CONTENTS = """
# This file is machine-generated - editing it directly is not advised

julia_version = "1.12.5"
manifest_format = "2.0"
project_hash = "ef864936120a7f6063966905ffaa0bd3822454a6"

[[deps.Artifacts]]
uuid = "56f22d72-fd6d-98f1-02f0-08ddc0907c33"
version = "1.11.0"

[[deps.Base64]]
uuid = "2a0f44e3-6c83-55bd-87e4-b1978d98bd5f"
version = "1.11.0"

[[deps.CSV]]
deps = ["CodecZlib", "Dates", "FilePathsBase", "InlineStrings", "Mmap", "Parsers", "PooledArrays", "PrecompileTools", "SentinelArrays", "Tables", "Unicode", "WeakRefStrings", "WorkerUtilities"]
git-tree-sha1 = "8d8e0b0f350b8e1c91420b5e64e5de774c2f0f4d"
uuid = "336ed68f-0bac-5ca0-87d4-7b16caf5d00b"
version = "0.10.16"

[[deps.CodecZlib]]
deps = ["TranscodingStreams", "Zlib_jll"]
git-tree-sha1 = "962834c22b66e32aa10f7611c08c8ca4e20749a9"
uuid = "944b1d66-785c-5afd-91f1-9de20f533193"
version = "0.7.8"

[[deps.Compat]]
deps = ["TOML", "UUIDs"]
git-tree-sha1 = "9d8a54ce4b17aa5bdce0ea5c34bc5e7c340d16ad"
uuid = "34da2185-b29b-5c13-b0c7-acf172513d20"
version = "4.18.1"
weakdeps = ["Dates", "LinearAlgebra"]

    [deps.Compat.extensions]
    CompatLinearAlgebraExt = "LinearAlgebra"

[[deps.CompilerSupportLibraries_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "e66e0078-7015-5450-92f7-15fbd957f2ae"
version = "1.3.0+1"

[[deps.Crayons]]
git-tree-sha1 = "54b76cbb40d9a0f5368c880725b2f141da77c94f"
uuid = "a8cc5b0e-0ffa-5ad4-8c14-923d3ee1735f"
version = "4.2.0"

[[deps.DataAPI]]
git-tree-sha1 = "abe83f3a2f1b857aac70ef8b269080af17764bbe"
uuid = "9a962f9c-6df0-11e9-0e5d-c546b8b5ee8a"
version = "1.16.0"

[[deps.DataFrames]]
deps = ["Compat", "DataAPI", "DataStructures", "Future", "InlineStrings", "InvertedIndices", "IteratorInterfaceExtensions", "LinearAlgebra", "Markdown", "Missings", "PooledArrays", "PrecompileTools", "PrettyTables", "Printf", "Random", "Reexport", "SentinelArrays", "SortingAlgorithms", "Statistics", "TableTraits", "Tables", "Unicode"]
git-tree-sha1 = "5fab31e2e01e70ad66e3e24c968c264d1cf166d6"
uuid = "a93c6f00-e57d-5684-b7b6-d8193f3e46c0"
version = "1.8.2"

[[deps.DataStructures]]
deps = ["OrderedCollections"]
git-tree-sha1 = "b0bc6d2cad1fed8b7fd59a1551a991cb3d2809e6"
uuid = "864edb3b-99cc-5e75-8d2d-829cb0a9cfe8"
version = "0.19.6"

[[deps.DataValueInterfaces]]
git-tree-sha1 = "bfc1187b79289637fa0ef6d4436ebdfe6905cbd6"
uuid = "e2d170a0-9d28-54be-80f0-106bbe20a464"
version = "1.0.0"

[[deps.Dates]]
deps = ["Printf"]
uuid = "ade2ca70-3891-5945-98fb-dc099432e06a"
version = "1.11.0"

[[deps.FilePathsBase]]
deps = ["Compat", "Dates"]
git-tree-sha1 = "3bab2c5aa25e7840a4b065805c0cdfc01f3068d2"
uuid = "48062228-2e41-5def-b9a4-89aafe57970f"
version = "0.9.24"

    [deps.FilePathsBase.extensions]
    FilePathsBaseMmapExt = "Mmap"
    FilePathsBaseTestExt = "Test"

    [deps.FilePathsBase.weakdeps]
    Mmap = "a63ad114-7e13-5084-954f-fe012c677804"
    Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"

[[deps.Future]]
deps = ["Random"]
uuid = "9fa8497b-333b-5362-9e8d-4d0656e87820"
version = "1.11.0"

[[deps.InlineStrings]]
git-tree-sha1 = "8f3d257792a522b4601c24a577954b0a8cd7334d"
uuid = "842dd82b-1e85-43dc-bf29-5d0ee9dffc48"
version = "1.4.5"

    [deps.InlineStrings.extensions]
    ArrowTypesExt = "ArrowTypes"
    ParsersExt = "Parsers"

    [deps.InlineStrings.weakdeps]
    ArrowTypes = "31f734f8-188a-4ce0-8406-c8a06bd891cd"
    Parsers = "69de0a69-1ddd-5017-9359-2bf0b02dc9f0"

[[deps.InteractiveUtils]]
deps = ["Markdown"]
uuid = "b77e0a4c-d291-57a0-90e8-8db25a27a240"
version = "1.11.0"

[[deps.InvertedIndices]]
git-tree-sha1 = "6da3c4316095de0f5ee2ebd875df8721e7e0bdbe"
uuid = "41ab1584-1d38-5bbf-9106-f11c6c58b48f"
version = "1.3.1"

[[deps.IteratorInterfaceExtensions]]
git-tree-sha1 = "a3f24677c21f5bbe9d2a714f95dcd58337fb2856"
uuid = "82899510-4779-5014-852e-03e436cf321d"
version = "1.0.0"

[[deps.JuliaSyntaxHighlighting]]
deps = ["StyledStrings"]
uuid = "ac6e5ff7-fb65-4e79-a425-ec3bc9c03011"
version = "1.12.0"

[[deps.LaTeXStrings]]
git-tree-sha1 = "dda21b8cbd6a6c40d9d02a73230f9d70fed6918c"
uuid = "b964fa9f-0449-5b57-a5c2-d3ea65f4040f"
version = "1.4.0"

[[deps.Libdl]]
uuid = "8f399da3-3557-5675-b5ff-fb832c97cbdb"
version = "1.11.0"

[[deps.LinearAlgebra]]
deps = ["Libdl", "OpenBLAS_jll", "libblastrampoline_jll"]
uuid = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
version = "1.12.0"

[[deps.Markdown]]
deps = ["Base64", "JuliaSyntaxHighlighting", "StyledStrings"]
uuid = "d6f4376e-aef5-505a-96c1-9c027394607a"
version = "1.11.0"

[[deps.Missings]]
deps = ["DataAPI"]
git-tree-sha1 = "ec4f7fbeab05d7747bdf98eb74d130a2a2ed298d"
uuid = "e1d29d7a-bbdc-5cf2-9ac0-f12de2c33e28"
version = "1.2.0"

[[deps.Mmap]]
uuid = "a63ad114-7e13-5084-954f-fe012c677804"
version = "1.11.0"

[[deps.OpenBLAS_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "Libdl"]
uuid = "4536629a-c528-5b80-bd46-f80d51c5b363"
version = "0.3.29+0"

[[deps.OrderedCollections]]
git-tree-sha1 = "05f45c2e0de6259db764adbfd2f1dc6d3f8de13c"
uuid = "bac558e1-5e72-5ebc-8fee-abe8a469f55d"
version = "2.0.1"

[[deps.Parsers]]
deps = ["Dates", "PrecompileTools", "UUIDs"]
git-tree-sha1 = "32a4e09c5f29402573d673901778a0e03b0807b9"
uuid = "69de0a69-1ddd-5017-9359-2bf0b02dc9f0"
version = "2.8.6"

[[deps.PooledArrays]]
deps = ["DataAPI", "Future"]
git-tree-sha1 = "36d8b4b899628fb92c2749eb488d884a926614d3"
uuid = "2dfb63ee-cc39-5dd5-95bd-886bf059d720"
version = "1.4.3"

[[deps.PrecompileTools]]
deps = ["Preferences"]
git-tree-sha1 = "edbeefc7a4889f528644251bdb5fc9ab5348bc2c"
uuid = "aea7be01-6a6a-4083-8856-8a6e6704d82a"
version = "1.3.4"

[[deps.Preferences]]
deps = ["TOML"]
git-tree-sha1 = "8b770b60760d4451834fe79dd483e318eee709c4"
uuid = "21216c6a-2e73-6563-6e65-726566657250"
version = "1.5.2"

[[deps.PrettyTables]]
deps = ["Crayons", "LaTeXStrings", "Markdown", "PrecompileTools", "Printf", "REPL", "Reexport", "StringManipulation", "Tables"]
git-tree-sha1 = "807a56f504aa08838a11e9a0727c3d704f90c44b"
uuid = "08abe8d2-0d0c-5749-adfa-8a2ac140af0d"
version = "3.4.4"

    [deps.PrettyTables.extensions]
    PrettyTablesExcelExt = "XLSX"
    PrettyTablesTypstryExt = "Typstry"

    [deps.PrettyTables.weakdeps]
    Typstry = "f0ed7684-a786-439e-b1e3-3b82803b501e"
    XLSX = "fdbf4ff8-1666-58a4-91e7-1b58723a45e0"

[[deps.Printf]]
deps = ["Unicode"]
uuid = "de0858da-6303-5e67-8744-51eddeeeb8d7"
version = "1.11.0"

[[deps.REPL]]
deps = ["InteractiveUtils", "JuliaSyntaxHighlighting", "Markdown", "Sockets", "StyledStrings", "Unicode"]
uuid = "3fa0cd96-eef1-5676-8a61-b3b8758bbffb"
version = "1.11.0"

[[deps.Random]]
deps = ["SHA"]
uuid = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
version = "1.11.0"

[[deps.Reexport]]
git-tree-sha1 = "45e428421666073eab6f2da5c9d310d99bb12f9b"
uuid = "189a3867-3050-52da-a836-e630ba90ab69"
version = "1.2.2"

[[deps.SHA]]
uuid = "ea8e919c-243c-51af-8825-aaa63cd721ce"
version = "0.7.0"

[[deps.SentinelArrays]]
deps = ["Dates", "Random"]
git-tree-sha1 = "084c47c7c5ce5cfecefa0a98dff69eb3646b5a80"
uuid = "91c51154-3ec4-41a3-a24f-3f23e20d615c"
version = "1.4.10"

[[deps.Sockets]]
uuid = "6462fe0b-24de-5631-8697-dd941f90decc"
version = "1.11.0"

[[deps.SortingAlgorithms]]
deps = ["DataStructures"]
git-tree-sha1 = "13cd91cc9be159e3f4d95b857fa2aa383b53772a"
uuid = "a2af1166-a08f-5f64-846c-94a0d3cef48c"
version = "1.2.3"

[[deps.Statistics]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "ae3bb1eb3bba077cd276bc5cfc337cc65c3075c0"
uuid = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"
version = "1.11.1"

    [deps.Statistics.extensions]
    SparseArraysExt = ["SparseArrays"]

    [deps.Statistics.weakdeps]
    SparseArrays = "2f01184e-e22b-5df5-ae63-d93ebab69eaf"

[[deps.StringManipulation]]
deps = ["PrecompileTools"]
git-tree-sha1 = "8a90c1d77c3277a5d43b83927b3cbe2c70a37484"
uuid = "892a3eda-7b42-436c-8928-eab12a02cf0e"
version = "0.4.7"

[[deps.StyledStrings]]
uuid = "f489334b-da3d-4c2e-b8f0-e476e12c162b"
version = "1.11.0"

[[deps.TOML]]
deps = ["Dates"]
uuid = "fa267f1f-6049-4f14-aa54-33bafae1ed76"
version = "1.0.3"

[[deps.TableTraits]]
deps = ["IteratorInterfaceExtensions"]
git-tree-sha1 = "c06b2f539df1c6efa794486abfb6ed2022561a39"
uuid = "3783bdb8-4a98-5b6b-af9a-565f29a5fe9c"
version = "1.0.1"

[[deps.Tables]]
deps = ["DataAPI", "DataValueInterfaces", "IteratorInterfaceExtensions", "OrderedCollections", "TableTraits"]
git-tree-sha1 = "0f38a06c83f0007bbab3cf911262841c9a0f07e0"
uuid = "bd369af6-aec1-5ad0-b16a-f7cc5008161c"
version = "1.13.0"

[[deps.TranscodingStreams]]
git-tree-sha1 = "0c45878dcfdcfa8480052b6ab162cdd138781742"
uuid = "3bb67fe8-82b1-5028-8e26-92a6c54297fa"
version = "0.11.3"

[[deps.UUIDs]]
deps = ["Random", "SHA"]
uuid = "cf7118a7-6976-5b1a-9a39-7adc72f591a4"
version = "1.11.0"

[[deps.Unicode]]
uuid = "4ec0a83e-493e-50e2-b9ac-8f72acf5a8f5"
version = "1.11.0"

[[deps.WeakRefStrings]]
deps = ["DataAPI", "InlineStrings", "Parsers"]
git-tree-sha1 = "0716e01c3b40413de5dedbc9c5c69f27cddfddfc"
uuid = "ea10d353-3f73-51f8-a26c-33c1cb351aa5"
version = "1.4.3"

[[deps.WorkerUtilities]]
git-tree-sha1 = "cd1659ba0d57b71a464a29e64dbc67cfe83d54e7"
uuid = "76eceee3-57b5-4d4a-8e66-0e911cebbf60"
version = "1.6.1"

[[deps.Zlib_jll]]
deps = ["Libdl"]
uuid = "83775a58-1f1d-513f-b197-d71354ab007a"
version = "1.3.1+2"

[[deps.libblastrampoline_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "8e850b90-86db-534c-a0d3-1478176c7d93"
version = "5.15.0+0"
"""

# ╔═╡ Cell order:
# ╟─85cad2ac-8c9c-11f1-b10f-09471d933726
# ╠═85cbdc56-8c9c-11f1-abb5-69c4daefa418
# ╠═85cbdc9c-8c9c-11f1-a8f4-01565d52ac7f
# ╟─85cbdca6-8c9c-11f1-aa0b-4716175106e1
# ╠═85cbdcb0-8c9c-11f1-88ae-8526772d05c9
# ╠═85cbdcbc-8c9c-11f1-9faa-79923ae87e85
# ╟─85cbdcc4-8c9c-11f1-a9c8-c113e8845208
# ╠═85cbdcce-8c9c-11f1-96d4-f174738d5c68
# ╠═85cbdcd8-8c9c-11f1-a1cc-bb3216fa38dc
# ╟─85cbdce2-8c9c-11f1-a483-dba8f738141e
# ╠═85cbdcee-8c9c-11f1-9a7f-b1d7ce711896
# ╠═85cbdcf6-8c9c-11f1-a6ad-61ec0604c0fb
# ╟─85cbdd00-8c9c-11f1-ae3e-15c1d8849bf7
# ╠═85cbdd14-8c9c-11f1-b1bc-07c3f95fc74c
# ╠═85cbdd1c-8c9c-11f1-b13c-95793d40329c
# ╟─85cbdd28-8c9c-11f1-a7b5-bd3c929e87e4
# ╠═85cbdd32-8c9c-11f1-b26f-dba267591fc8
# ╠═85cbdd46-8c9c-11f1-9b42-479a94ffd960
# ╠═85cbdd4e-8c9c-11f1-ac3e-2b312db1de1e
# ╟─85cbdd5a-8c9c-11f1-afac-b7726c78e252
# ╟─00000000-0000-0000-0000-000000000001
# ╟─00000000-0000-0000-0000-000000000002
