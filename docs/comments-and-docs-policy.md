# 📝 Comments and docs policy

When a code comment or a doc earns its place, and where it goes. _Docs_ are the Markdown files
contributors read: READMEs, `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md` and everything under
`docs/`. Applies repo-wide, to human and AI contributions alike. Everything up to
[Comments](#-comments) applies to comments and docs alike.

## The default

Code should be declarative and self-explanatory, expressed through naming, types and structure.
A comment or a doc carries only what the code _cannot_ express.

## The test

Before adding a comment or a doc section, and when deciding whether an existing one stays, ask
what happens without it: **would a competent reader make a wrong change?** If not, leave it out.
If so, prefer a test that catches the wrong change; otherwise put it where that reader will meet
it (below).

- **A reader who would look it up anyway does not need it**; one who would not think to look does.
- **When borderline, leave it out.**

## Where it goes

| What                                                    | Where it goes                                                        |
| :------------------------------------------------------ | :------------------------------------------------------------------- |
| a constraint on one piece of code                       | a comment at that code, see [Comments](#-comments)                   |
| what every change to `backend/` or `frontend/` needs    | that part's `README.md`, see [Part READMEs](#part-readmes)           |
| what every change in the repo needs                     | `CONTRIBUTING.md`, `ARCHITECTURE.md` or `docs/`                      |
| behaviour a test can check                              | the test                                                             |
| anything with a home of its own, a file or a tool's docs | that home: link it                                                  |
| what the code does, or a narration of its steps         | nowhere: the code says it                                            |
| history ("ported from …", "was X, now Y")               | the commit message                                                   |
| status ("in place", "not yet", "upcoming")              | a GitHub issue                                                       |

**Never reference one of this repo's issues** in a comment or doc. Issues are short-lived, comments
and docs are not. The one exception is a `TODO(#nnn)` code comment.

## 💬 Comments

| A comment for…                         | must include…                               |
| :------------------------------------- | :------------------------------------------ |
| a workaround for an external bug       | a link to the upstream issue                |
| version- or platform-specific behavior | the version or platform it depends on       |
| a non-obvious failure mode             | what triggers it                            |
| an invisible constraint                | the source the value must stay in sync with |
| code that looks wrong but is right     | what breaks if it is "fixed"                |

A comment, Javadoc and JSDoc included, is at most **two lines**; a workaround may take a third for
its upstream link. State the constraint, not the story.

## 📚 Docs

Docs are onboarding guideposts: architecture, conventions, footguns, runbooks. Prefer a table or a
diagram to prose.

### Part READMEs

`backend/README.md` and `frontend/README.md` are read before every change to that part, so they
hold only what every such change needs: what the part is, how it is wired, and the rules and
footguns every contributor must know.

- **No section for a component, a screen or a feature.** It matters only to whoever changes it, so
  its constraints go in comments and its behaviour in tests.
- It **ends with `💻 Development` and `🧪 Testing`**, in that order. They hold only what is specific
  to the part (its commands, ports and test layers) and link [`CONTRIBUTING.md`](../CONTRIBUTING.md)
  and [`testing-strategy.md`](./testing-strategy.md) rather than repeat them.
- A reference to the other part is a **relative link to its `README.md`**.
- Its `AGENTS.md` is a **thin pointer**: a few bullets linking that `README.md` and whatever shared
  docs the part needs. Rules live in the `README.md`, never in both. `CLAUDE.md` stays the bare
  `@AGENTS.md` include.

### The root README

[`README.md`](../README.md) is the public face of the project: what the game is, how to play it,
its rules, its anti-cheat and how it was built. Developer detail goes in the files above and is
linked from there.
