# HuddlePals

The website for HuddlePals, a private photo-sharing app for small groups of friends on iPhone, with end-to-end encrypted photos.

Visit [huddlepals.com](https://huddlepals.com).

The app asks for a self-reported birthday before sign-in and requires a
recorded eligible birthday before huddle access. Keep the website Terms,
Privacy Policy, and Support answers aligned with that flow. Terms in
`src/content/terms.md` must match the app's bundled Terms after replacing
`{{CONTACT_EMAIL}}` with the address in `src/config.ts`.

The matching app release requires migration `019_age_eligibility.sql` before
it ships. This repository change prepares the website copy; it does not
apply the migration or publish the website.

## Contact

Questions or feedback: [hello@huddlepals.com](mailto:hello@huddlepals.com)
