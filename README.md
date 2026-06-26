# Secondhand Trust Link

Secondhand Trust Link is a static MVP for safer secondhand trading links. It is designed to explain a transaction, highlight seller and buyer safety checks, and share non-custodial guidance without asking either party to hand funds to this project.

## MVP scope

- Static GitHub Pages site only; no backend, database, npm build, or server runtime.
- Safety-link experience for secondhand transactions: transaction summary, risk reminders, and recommended off-platform verification steps.
- Educational and coordination layer only; it does not custody assets or settle payments.
- Open-source friendly documentation so reviewers can inspect copy, deployment settings, and legal boundaries.

## Non-custodial boundaries

This project is not an escrow provider, exchange, broker, money transmitter, wallet operator, payment processor, or financial institution.

The MVP must not:

- Hold, receive, pool, or control user funds or digital assets.
- Perform crypto swaps, token exchange, fiat on-ramp, or fiat off-ramp flows.
- Provide a platform wallet, hosted wallet, managed private key, or recovery service.
- Promise transaction settlement, chargeback protection, buyer protection, seller protection, or dispute resolution.
- Present itself as legal, financial, tax, compliance, or investment advice.

Users should use their own trusted payment, marketplace, wallet, or in-person verification process. Any transaction decision remains between buyer and seller.

## GitHub Pages deployment

This folder is intended to be deployed as a pure static site.

1. Keep all public static files inside `secondhand-trust-link/`.
2. Enable GitHub Pages in the repository settings.
3. Select GitHub Actions as the Pages source.
4. Use `.github/workflows/pages.yml` to upload `secondhand-trust-link/` as the Pages artifact.
5. Push changes to `main` or run the workflow manually from the Actions tab.

Important repository-layout note: GitHub only discovers workflows from the repository-root `.github/workflows/` directory. This MVP stores the workflow under `secondhand-trust-link/.github/workflows/pages.yml` to keep the existing parent project untouched. If `secondhand-trust-link/` becomes its own repository, the workflow is already in the correct relative location. If it stays as a subdirectory of a larger repository, copy the workflow to the repository-root `.github/workflows/pages.yml` when the owner approves touching root-level deployment files.

## No npm required

There is no package manager step. Do not add `package.json`, `node_modules/`, bundlers, or generated frontend build folders unless the project scope changes.

## Open-source strategy recommendation

- Start with source-available public review if legal positioning is still being validated.
- Move to a standard permissive license such as MIT or Apache-2.0 only after the owner confirms IP, trademark, and compliance expectations.
- Keep legal boundary text, risk disclaimers, and deployment workflow in version control so changes are auditable.
- Accept issues and pull requests for copy clarity, accessibility, and security wording, but avoid accepting features that introduce custody, wallet, exchange, or payment-processing behavior.
- Consider a small `SECURITY.md` later if the project adds forms, scripts, third-party embeds, or user-submitted content.

## Local preview

Because the MVP is static, open `index.html` directly once a page is added, or serve the folder with any local static-file server. No npm command is required.
