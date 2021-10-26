# Simple Git-Crawler API :gem: 

A simple API using Node.js with Express written in Typescript.

## Requirements

- [Node.js (15.12.0)](https://yarnpkg.com/en/docs/install)
- [NPM](https://docs.npmjs.com/getting-started/installing-node)
- [Docker](https://docs.docker.com/install/)

## Getting Started

Clone the repository, install the dependencies.

```bash
$ git clone https://github.com/MateusVT/Git-Crawler <application-name>

$ cd <application-name>

```

```bash
$ npm install

$ npm start 

```


```

**Listing Routes**

### Usage

By default git-crawler will run at localhost:3000.

e.g.

GET localhost:3000/execute?token=your_token // Execute crawler.
GET localhost:3000/routes // Returns all routes currently available
```

Generate your GitHub token here: https://github.com/settings/tokens