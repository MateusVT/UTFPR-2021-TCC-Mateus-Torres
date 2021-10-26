import { Request, Response } from 'express';
import { Repository, WeeklyDistribution } from '../../types/types';
import * as HttpStatus from 'http-status-codes';
import { readFileFrom } from '../../utils/handleFile';
import { loadAbsoluteMoment, Moment, nowLocale } from '../../utils/moment';
import fs from 'fs';
import { Octokit } from '@octokit/rest';
const { Chart } = require('echarts-ssr');

export async function execute(req: Request, res: Response) {

    const repository: Repository = readFileFrom("resources/output/c/curl-curl.json")

    // res.status(HttpStatus.OK).json(repository.weekly_distribuition!);
    res.status(HttpStatus.OK).json(fullFillDistribuition(repository.weekly_distribuition!, repository.created_at!));
}


export async function replaceHelpWantedVariationsInRepositoriesData(req: Request, res: Response) {
    const helpWantedVariations = [
        "status/help-wanted",
        "help needed",
        "Help wanted",
        "help wanted",
        "Help Wanted",
        "help-wanted",
        "disposition/help wanted",
        "HelpWanted",
        "Help-Wanted",
        "state: help wanted (PR)",
        "status: help wanted",
        "Type: help-wanted",
        "type/help-wanted"
    ]
    const languages = ["c", "cplusplus", "csharp", "go", "java", "javascript", "php", "python", "ruby", "typescript"]

    languages.forEach(language => {

        const dir = `resources/output/${language}/`
        const fileRepositories = fs.readdirSync(dir).filter(file => file.includes(".json"))
        const repositories: Repository[] = fileRepositories.map(repository => readFileFrom(`${dir}/${repository}`))

        const repositoriesWithoutHelpWanted = repositories.filter(repository => {
            const new_comer_labels = repository.newcomer_labels!!.map(label => label.name.toLowerCase())
            return !new_comer_labels.some(label => helpWantedVariations.includes(label))
        })

        repositoriesWithoutHelpWanted.forEach(repo => {
            repo.has_newcomer_labels = repo.newcomer_labels!!.length > 0;
            // save(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
            generateGraph(`${repo.owner}-${repo.name}`.replace(/\//g, ''), repo, language)
        })
    })

    res.status(HttpStatus.OK).json("finish");
}


function generateGraph(name: string, rep: Repository, language: string) {

    //Adiciona um log de semana para não quebrar o gráfico
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
                        name: 'Normalização (6 meses)',
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


    // const chart = new Chart(1500, 800);
    // chart.renderToFileSync(option, `resources/output-without-helpwanted/${language}/${name}.png`);

    if (rep.newcomer_labels!!.length > 0) {
        const split_position = rep.weekly_distribuition!.findIndex(it => it.week == loadAbsoluteMoment(rep.newcomer_labels!![0].created_at).format('WW GGGG'))
        // rep.weekly_distribuition_before = rep.weekly_distribuition!.slice(0, split_position).map(distribuition => distribuition.total)
        // rep.weekly_distribuition_after = rep.weekly_distribuition!.slice(split_position, rep.weekly_distribuition!.length).map(distribuition => distribuition.total)
        rep.weekly_distribuition_before = rep.weekly_distribuition!.slice(0, split_position).map(distribuition => distribuition.total)
        rep.weekly_distribuition_after = rep.weekly_distribuition!.slice(split_position, rep.weekly_distribuition!.length).map(distribuition => distribuition.total)
        save(`${rep.owner}-${rep.name}`.replace(/\//g, ''), rep, language)
    }
}



function save(name: string, data: any, language: string) {
    fs.writeFile(`resources/output-without-helpwanted/${language}/${name}.json`, JSON.stringify(data), function (err) {
        console.log("saved: " + language + " - " + name)
        if (err) {
            console.log(err);
        }
    });
}


function fullFillDistribuition(weeklyDistribuition: WeeklyDistribution[], created_at: string) {

    const lastPR = weeklyDistribuition[weeklyDistribuition.length - 1].week
    const fullFillDistribution = [...weeklyDistribuition]

    for (var created = loadAbsoluteMoment(created_at); created.isBefore(nowLocale()); created.add(1, 'week')) {
        const this_week = created.format('WW GGGG')
        if (!weeklyDistribuition.some(distribution => distribution.week == this_week)) {
            fullFillDistribution.push({ week: this_week, total: 0, dates: [] })
        }
    }
    return fullFillDistribution.sort((a, b) =>
        (loadAbsoluteMoment(a.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(b.week, 'WW GGGG').valueOf()) ?
            1 :
            ((loadAbsoluteMoment(b.week, 'WW GGGG').valueOf() > loadAbsoluteMoment(a.week, 'WW GGGG').valueOf())
                ? -1 : 0))

}