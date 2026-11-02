# Fake content

Everything here is invented. The repo is public, so no real course content, question, image or note may ever be added. The files use the real app's schema, so the game logic and the web client load them as they would load real ones.

```
content/
├── quizzes/
│   ├── courses.json                  the course registry (code, name, short name, answer mode)
│   └── <course code>/<short>-....json  one quiz file per topic
└── images/
    └── <course code>/*.png            flat-shape pictures that the image questions refer to
```

| Course      | Short   | Answered by | Holds                                                                                                                                   |
| ----------- | ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-1001` | `birds` | picking     | Text, image and image-group questions; awkward whitespace; a chapter file; a file with a `group` label                                  |
| `demo-2002` | `rocks` | typing      | Correct answers a typed check accepts (brackets, apostrophes, accents) and ones it cannot (digits, commas, slashes, long, two brackets) |

An image's `image_path` is `images/<course code>/<name>.png`, relative to this folder, as in the real app.

## Checking it

`npm run validate:content` runs the validator (`packages/quiz-validator`) over this folder, strictly, and checks that the cases the roadmap asks for are still here. It is part of `npm run check`. Run it after every edit.

## The pictures

`node scripts/make-content-images.mjs` rewrites every picture. Each is a few flat shapes, and the script lists what each one shows, which the questions are written against. If you change a picture, change its questions and run the check.

## Adding content

Follow the naming and id rules the validator checks: file `<short>-w<N>-<topic>.json` (or `-ch<N>-`), standalone ids `<short>_NN`, groups `<short>_group_NN`, parts `<group id>_pN`. Keep every question about invented things.
