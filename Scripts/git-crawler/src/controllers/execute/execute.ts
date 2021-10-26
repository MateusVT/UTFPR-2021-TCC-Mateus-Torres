import { Octokit } from '@octokit/rest';

import { Request, Response } from 'express';

import * as HttpStatus from 'http-status-codes';
import { Contribution, Label, Repository, WeeklyDistribution } from '../../types/types';
import { readFileFrom } from '../../utils/handleFile';
import fs from 'fs';
import { loadAbsoluteMoment, nowLocale } from "../../utils/moment"
const { Chart } = require('echarts-ssr');

let tokenIndex = 0
const OAuthTokens = ["git_token_here"]
let octokit: Octokit = new Octokit({ auth: OAuthTokens[tokenIndex] })
const newcomer_labels = loadNewCommerLabels()//Load dataset of newcomer labels
const repositories = loadRepositoriesSampleByLanguage()//Load repositories sample
// const repositoriesData = loadRepositoriesSamplesData()//Load repositories data sample 
const languages = ["c", "cplusplus", "csharp", "go", "java", "javascript", "php", "python", "ruby", "typescript"] as const

export async function execute(req: Request, res: Response) {

  if (req.query.token != undefined) {
    console.log(req.query.token)
    octokit = new Octokit({ auth: req.query.token })
  }

  //Use to run the script individually
  // run({
  //   owner: "borgbackup", name: "borg",
  //   url: "http://www.github.com/borgbackup/borg",
  //   language: "C",
  //   nameconcat: "borgbackup/borg"
  // }, "c")

  let limitRemaining = await getRateLimitRemaining()
  console.log("[Start] Limit Remaining: ", limitRemaining)

  languages.reduce(
    (promisse, language) =>
      promisse.then(async _ => {
        console.log("Started Language: " + language)
        await repositories[language].reduce(
          (promisse, repo) =>
            promisse.then(_ => {
              const alreadyCrawled = fs.readdirSync(`resources/output/${language}`)
              if (alreadyCrawled.includes(`${repo.owner}-${repo.name}.json`.replace(/\//g, ''))) {
                console.log("Skipped: " + `${repo.owner}-${repo.name}`)
                return
              } else {
                return run(repo, language)
              }
            }),
          Promise.resolve())

      }),
    Promise.resolve())
  console.log("[End] Limit Remaining: ", await getRateLimitRemaining())

  res.status(HttpStatus.OK).end();
}

async function run(repo: Repository, language: string) {

  repo.script_execution = { start_at: nowLocale().format("LT L") }

  let repo_infos: any
  let repo_first_contribuitions: Contribution[] = []
  let repo_labels: string[] = []
  let repo_newcomer_labels: string[] = []
  let repo_newcomer_labels_date: Label[] = []
  let weekly_distribuition: WeeklyDistribution[] = []

  repo_infos = await getRepoInfos(repo.owner!, repo.name!);//Return general infos of a repository
  console.log()

  repo_first_contribuitions = await getAllFirstContributions(repo.owner!, repo.name!);//Return a list of all contributors with the date of theirs first contributions
  console.log()

  repo_labels = await getAllLabels(repo.owner!, repo.name!);//Return all labels from the given repository
  console.log()

  repo_newcomer_labels = await findNewcomerLabelsInRepository(repo.owner!, repo.name!, repo_labels);//Find all newcomer labels on the repositorie (based on our dataset)
  console.log()

  repo_newcomer_labels_date = await getFirstOcurrenciesNewComerLabels(repo.owner!, repo.name!, repo_newcomer_labels);//Find all newcomer labels on the repositorie (based on our dataset)
  console.log()

  weekly_distribuition = await getWeeklyDistribution(repo_first_contribuitions);//Find all newcomer labels on the repositorie (based on our dataset)
  console.log()

  repo.id = repo_infos.id
  repo.created_at = repo_infos.created_at
  repo.stars = repo_infos.stargazers_count
  repo.subscribers = repo_infos.subscribers_count
  repo.watchers = repo_infos.watchers_count
  repo.forks = repo_infos.forks_count
  repo.first_contribuitions = repo_first_contribuitions
  repo.weekly_distribuition = fullFillDistribuition(weekly_distribuition, repo.created_at!)
  repo.labels = repo_labels
  repo.newcomer_labels = repo_newcomer_labels_date.sort()
  repo.script_execution.finished_at = nowLocale().format("LT L")
  repo.newcomer_labels.length > 0 ? repo.has_newcomer_labels = true : repo.has_newcomer_labels = false

  if (repo.newcomer_labels.length > 0) {
    const split_position = repo.weekly_distribuition.findIndex(it => it.week == loadAbsoluteMoment(repo.newcomer_labels![0].created_at).format('WW GGGG'))
    repo.weekly_distribuition_before = repo.weekly_distribuition.slice(0, split_position).map(distribuition => distribuition.total)
    repo.weekly_distribuition_after = repo.weekly_distribuition.slice(split_position, repo.weekly_distribuition!.length).map(distribuition => distribuition.total)
  }

  save(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
  generateGraph(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
}

export async function treatment(req: Request, res: Response) {
  removeHelpWantedVariations()
}

//Remove all help-wanted variations from newcomerlabels set and gerenate payload and graphs again
export async function removeHelpWantedVariations() {
  const repositories = loadRepositoriesSamplesData()

  const helpWantedVariations = [
    "status/help-wanted",
    "help needed",
    "help wanted",
    "help-wanted",
    "disposition/help wanted",
    "helpwanted",
    "state: help wanted (pr)",
    "status: help wanted",
    "type: help-wanted",
    "type/help-wanted"]

  let cont = 0
  repositories.forEach(repo => {
    // console.log("---------------------------------------")
    
    
    let help = repo.newcomer_labels?.filter(label => helpWantedVariations.includes(label.name.toLowerCase())).length || 0
    if (help > 0) {
      console.log(repo.language + " - " + repo.nameconcat)
      console.log(repo.newcomer_labels?.filter(label => helpWantedVariations.includes(label.name.toLowerCase())))
      const removed_help_wanted = repo.newcomer_labels?.filter(label => !helpWantedVariations.includes(label.name.toLowerCase()))
      let removed = removed_help_wanted?.length || 0
      if(removed > 0) {
        cont++
      }
    }
    // const removed_help_wanted = repo.newcomer_labels?.filter(label => !helpWantedVariations.includes(label.name.toLowerCase()))
    // repo.newcomer_labels = removed_help_wanted

    // if (removed_help_wanted && removed_help_wanted.length > 0) {
    //   repo.has_newcomer_labels = true
    // } else {
    //   repo.has_newcomer_labels = false

    // }
    // console.log("removed = " + JSON.stringify(repo.newcomer_labels))
    // console.log("has_newcomer_labels = " + repo.has_newcomer_labels )
    // let language = repo.language!
    // if(language == "C++"){
    //   language = "cplusplus"
    // }
    // if(language == "C#"){
    //   language = "csharp"
    // }
    // save(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
    // generateGraph(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
    // console.log("---------------------------------------")
  })
  console.log(cont)
}

//Collect general infos about the repo
async function getRepoInfos(owner: string, repo: string) {

  const repoInfos = (await octokit.rest.repos.get({ owner: owner, repo: repo })).data
  return repoInfos

}

//Find the date of the first contribution of all contributors of the project.
async function getAllFirstContributions(owner: string, repo: string) {
  const contributors: string[] = []
  const firstContributions: Contribution[] = []
  let page = 0

  console.log("- COLLECTING FIRST CONTRIBUTIONS FROM PROJECT " + owner + "/" + repo + " -")
  for await (const response of octokit.paginate.iterator(
    "GET /repos/:owner/:repo/pulls",
    {
      owner: owner,
      repo: repo,
      state: "all",
      per_page: 100
    }
  )) {

    console.log("<-start for each {" + page + "}->")
    response.data.forEach((pullRequest: any) => {
      if (!contributors.includes(pullRequest.user.login)) {
        const pr: Contribution = { login: pullRequest.user.login, created_at: pullRequest.created_at, issue_number: pullRequest.number }
        contributors.push(pr.login)
        firstContributions.push(pr)
        console.log(pr)
      }
    })
    page = page + 1
    console.log("<-end for each->")
  }

  return firstContributions
}

//Collects all labels of the project.
async function getAllLabels(owner: string, name: string) {
  const labels: string[] = []
  let page = 0
  console.log("- COLLECTING LABELS FROM PROJECT " + owner + "/" + name + " -")
  for await (const response of octokit.paginate.iterator(
    "GET /repos/:owner/:repo/labels",
    {
      owner: owner,
      repo: name,
      per_page: 100
    }
  )) {
    response.data.forEach((label: any) => {
      labels.push(label.name)
      console.log(label.name)
    })
    page = page + 1
  }

  return labels
}

//Collect the date of the first occurrence of the newcomers labels in the project.
async function getFirstOcurrenciesNewComerLabels(owner: string, name: string, newcomer_labels: string[]) {
  let i = 0
  let newcomer_labels_date: Label[] = []

  console.log("- COLLECTING FIRST OCURRENCY OF LABELS " + newcomer_labels.toString() + " FROM PROJECT " + owner + "/" + name + " -")
  const promisses = await newcomer_labels.map(async (label) => {
    const issues = await octokit.issues.listForRepo({ repo: name, owner: owner, sort: "created", direction: "asc", state: "all", labels: label, per_page: 1 })
    const issue = issues.data[0]
    if (issue != undefined) {
      const label_data = { name: label, created_at: issue.created_at }
      console.log(label_data)
      newcomer_labels_date.push(label_data)
    }
    i = i + 1
  })

  await Promise.all(promisses);

  return newcomer_labels_date.sort((a, b) => {
    return loadAbsoluteMoment(a.created_at).diff(b.created_at);
  });
}

//Find all newcomer labels in the project data
function findNewcomerLabelsInRepository(owner: string, name: string, repo_labels: string[]) {
  const repo_newcomer_labels: string[] = []
  console.log("- FINDING NEWCOMER LABELS FROM PROJECT " + owner + "/" + name + " -")

  repo_labels.forEach(label => {
    if (newcomer_labels.includes(label.toLocaleLowerCase())) {
      console.log("newcomer label found -> " + label)
      repo_newcomer_labels.push(label)
    }
  })

  return repo_newcomer_labels
}

//Loads all newcomer labels dataset.
function loadNewCommerLabels() {
  const all_newcomer_labels: string[] = readFileFrom("resources/input/labels/all-labels.json")
  return all_newcomer_labels.map(label => label.toLocaleLowerCase())
}

//Loads the sample.
function loadAllRepositoriesSamples() {
  const all_repositories: Repository[] = readFileFrom("resources/input/all-repositories.json")
  return all_repositories
}

//Loads the samples by language.
function loadRepositoriesSampleByLanguage(type?: string) {

  const c: Repository[] = readFileFrom("resources/input/repositories-by-language/c.json")
  const csharp: Repository[] = readFileFrom("resources/input/repositories-by-language/csharp.json")
  const cplusplus: Repository[] = readFileFrom("resources/input/repositories-by-language/cplusplus.json")
  const go: Repository[] = readFileFrom("resources/input/repositories-by-language/go.json")
  const java: Repository[] = readFileFrom("resources/input/repositories-by-language/java.json")
  const javascript: Repository[] = readFileFrom("resources/input/repositories-by-language/javascript.json")
  const php: Repository[] = readFileFrom("resources/input/repositories-by-language/php.json")
  const python: Repository[] = readFileFrom("resources/input/repositories-by-language/python.json")
  const ruby: Repository[] = readFileFrom("resources/input/repositories-by-language/ruby.json")
  const typescript: Repository[] = readFileFrom("resources/input/repositories-by-language/typescript.json")

  const all_repositories = {
    c: c,
    cplusplus: cplusplus,
    csharp: csharp,
    go: go,
    java: java,
    javascript: javascript,
    php: php,
    python: python,
    ruby: ruby,
    typescript: typescript,
  }


  return all_repositories
}

//Loads the samples data by language.
function loadRepositoriesSamplesData() {
  const languages = ["c", "cplusplus", "csharp", "go", "java", "javascript", "php", "python", "ruby", "typescript"] as const
  let repositories: Repository[] = []
  languages.forEach(language => {

    const dir = `resources/output/${language}/`
    const fileRepositories = fs.readdirSync(dir).filter(file => file.includes(".json"))
    const repositoriesByLanguage: Repository[] = fileRepositories.map(repository => readFileFrom(`${dir}/${repository}`))
    repositories.push(...repositoriesByLanguage)

  })
  return repositories
}

//Verify if the list of repositories still up to date based on their names.
async function pingRepositories(repositories: Repository[]) {

  const renamedRepos: Repository[] = []
  const notRenamedRepos: Repository[] = []
  const promisses = await repositories.map(async repository => {
    const ping = await octokit.repos.get({ owner: repository.owner!, repo: repository.name! }).catch(error => { return undefined })
    if (ping == undefined) {
      renamedRepos.push({ name: repository.name, language: repository.language })
    } else {
      notRenamedRepos.push({ name: repository.name, language: repository.language })
    }
  })

  await Promise.all(promisses);

  saveJson("renamed-repositories", renamedRepos)
  saveJson("not-renamed-repositories", notRenamedRepos)

}

//Remove from the sample all repositories that have been moved ou renamed.
function cleanSampleRepositories(repositories: Repository[]) {
  const renamedRepos: Repository[] = readFileFrom("resources/renamed-repositories.json")
  const names = renamedRepos.map(repo => repo.name)
  const cleanSample = repositories.filter(repository => {
    return !names.includes(repository.name);
  })
  saveJson("all-repositories-clean", cleanSample)

}

//Return the first contribuitions of newcomers from a repository grouped by week.
function getWeeklyDistribution(first_contribuitions: Contribution[]) {
  const contribuitions_date = first_contribuitions!.map(contribuition => {
    return contribuition.created_at
  })

  const weeklyDistribution: WeeklyDistribution[] = []

  contribuitions_date.forEach(date => {
    let weekLabel = loadAbsoluteMoment(date).format('WW GGGG');
    let log = weeklyDistribution.find(it => it.week == weekLabel)
    if (log) {
      log.dates.push(date)
      log.total!++
    } else {
      weeklyDistribution.push({
        week: weekLabel,
        dates: [date],
        total: 1
      })
    }

  })

  return weeklyDistribution.reverse()
}

// Create a empty position for the weeks that haven't any new contribution
// This is necessary in order to generate the Graph 
function fullFillDistribuition(weeklyDistribution: WeeklyDistribution[], created_at: string) {

  const fullFillDistribution = [...weeklyDistribution]

  for (var created = loadAbsoluteMoment(created_at); created.isBefore(nowLocale()); created.add(1, 'week')) {
    const this_week = created.format('WW GGGG')
    if (!weeklyDistribution.some(distribution => distribution.week == this_week)) {
      fullFillDistribution.push({ week: this_week, total: 0, dates: [] })
    }
  }
  return fullFillDistribution.sort((a, b) =>
    (loadAbsoluteMoment(a.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(b.week, 'WW GGGG').valueOf()) ?
      1 :
      ((loadAbsoluteMoment(b.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(a.week, 'WW GGGG').valueOf())
        ? -1 : 0))

}

// Remove the first 6 months data of an distribution 
function normalizeDistribuition(weeklyDistribution: WeeklyDistribution[]) {

  const firstPR = weeklyDistribution[0].week
  const lastPR = loadAbsoluteMoment(firstPR, "WW GGGG").add(6, 'months').format("WW GGGG")
  const indexOfLast = weeklyDistribution.map(d => d.week).indexOf(lastPR)

  return weeklyDistribution.splice(0, indexOfLast)

}

//Save a JSON file at 'resources/output'
function save(name: string, data: any, language: string) {
  fs.writeFile(`resources/output/${language}/${name}.json`, JSON.stringify(data), function (err) {
    if (err) {
      console.log(err);
    }
  });
}

//Save a JSON file at 'resources/output'
function saveJson(name: string, data: any) {
  fs.writeFile(`resources/${name}.json`, JSON.stringify(data), function (err) {
    if (err) {
      console.log(err);
    }
  });
}

function generateGraph(name: string, rep: Repository, language: string) {

  //Add one log in the week of first use of the label in order to not broke the graph
  if (rep.newcomer_labels && rep.newcomer_labels.length > 0 &&
    !rep.weekly_distribuition?.find(distribuition => distribuition.week == loadAbsoluteMoment(rep.newcomer_labels!![0].created_at).format('WW GGGG'))) {
    rep.weekly_distribuition!.push({ week: loadAbsoluteMoment(rep.newcomer_labels!![0].created_at).format('WW GGGG'), dates: [], total: 0 })
  }

  //TODO remove this sort
  rep.weekly_distribuition?.sort((a, b) =>
    (loadAbsoluteMoment(a.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(b.week, 'WW GGGG').valueOf()) ?
      1 :
      ((loadAbsoluteMoment(b.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(a.week, 'WW GGGG').valueOf())
        ? -1 : 0))


  var option = {
    grid: {
      top: 70,
      bottom: 60,
      left: '2%',
      right: '2%',
    },
    title: {
      text: 'Gráfico de Distribuição de Ingresso Semanal de Novatos',
      subtext: rep.nameconcat,
      left: 'center',
      padding: 0
    },
    legend: {
      y: 'bottom',
      icon: 'line',
      color: 'blue'
    },
    backgroundColor: 'white',
    renderAsImage: true,
    toolbox: {
      show: false
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: rep.weekly_distribuition?.map(distribuition => distribuition.week),
      markLine: {
        data: rep.newcomer_labels && rep.newcomer_labels.length > 0 ?
          [{ name: 'First Date Newcomer Label', yAxis: loadAbsoluteMoment(rep.newcomer_labels[0].created_at).format('WW[S] GGGG[A]') }]
          : []
      }

    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}'
      }
    },
    series: [
      {
        name: 'Quantidade de primeiras contribuições por semana',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: rep.weekly_distribuition?.map(distribuition => distribuition.total),
        markArea: {
          data: [[{
            name: 'Tratamento (6 meses)',
            xAxis: rep.weekly_distribuition![0].week
          }, {
            xAxis: loadAbsoluteMoment(rep.weekly_distribuition![0].week, "WW GGGG").add(6, 'months').format("WW GGGG")
          }]]
        },
        dimensions: [
          { name: 'timestamp', type: 'time' }],
        lineStyle: {
          normal: {
            width: '2',
            color: 'gray'
          }
        },
        markLine: rep.newcomer_labels && rep.newcomer_labels.length > 0 ? {
          label: {
            show: true,
            formatter: rep.newcomer_labels!![0].name
          },
          data: [
            {
              name: 'Adopted the pratice', xAxis: loadAbsoluteMoment(rep.newcomer_labels!![0].created_at).format('WW GGGG'),
              lineStyle: {
                normal: {
                  type: 'dashed',
                  color: 'red'
                }
              }
            }
          ]
        } : {}
      },

    ]
  };

  const chart = new Chart(1500, 800);
  chart.renderToFileSync(option, `resources/output/${language}/${name}.png`);
}

//Returns the request limit remaining for a given token.
async function getRateLimitRemaining() {
  const rateLimit = await octokit.rateLimit.get()
  const rateLimitData = rateLimit.data
  return rateLimitData
}

export async function limit(req: Request, res: Response) {

  res.status(HttpStatus.OK).json(await getRateLimitRemaining())

}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
