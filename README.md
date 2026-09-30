# 心電図試験問題ジェネレーター

12誘導心電図の試験問題作成と、学生向けの計測・判読練習を行うブラウザアプリです。

**[アプリを開く](https://ashukuri.github.io/ecg-exam-generator/)**

## 主な機能

- 正常洞調律、不整脈、伝導障害、虚血性変化など53種類の心電図プリセット
- 心拍数やノイズ、電極の付け間違い・脱落などの条件設定
- 複数症例を組み合わせた試験問題セットの作成
- 問題用紙・解答・計測ワークシートのPDF出力、心電図のPNG出力
- 学生向け計測練習と許容誤差を指定した採点
- 問題セットのJSON保存・読み込み、ブラウザ内の自動保存

教育・学習用に合成した心電図を使用します。臨床診断を目的としたアプリではありません。

## ローカルで実行

Node.js 22.12以降（22系）または24系を使用してください。

```bash
npm ci
npm run dev
```

## 検証とビルド

```bash
npm test
npm run build
```

React・TypeScript・Vite・Tailwind CSSを使用しています。

## GitHub Pages

`main` ブランチへのpushでGitHub Actionsがテスト・ビルドを実行し、GitHub Pagesへ公開します。
Viteの公開パスはリポジトリ名から自動設定されます。

プリセットの検証資料は [臨床参照マトリクス](docs/clinical-reference-matrix.md) を参照してください。
