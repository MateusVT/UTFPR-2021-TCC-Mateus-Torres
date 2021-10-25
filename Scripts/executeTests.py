#!/usr/bin/env python

from multiprocessing import Process
import sys
import argparse
from datetime import datetime, date # Manipulação de datas
from operator import itemgetter # Facilita recuperar dados de um dicionário
import json #Leitor de json
import numpy as np #Numpy para operar com matrizes
import rpy2.robjects as robjects #Utilizar funções do R diretamente no Python
from rpy2.robjects.packages import importr
import time #Medidas de performance e tempo de execução
import statistics as stats
import os
from glob import glob

effsize = importr('effsize') 
start_time = time.time()

parser = argparse.ArgumentParser(
    description="Gerar statísticas de projetos do GitHub usando funções da linguagem R.")
parser.add_argument('dir', nargs='?',  default='resources', help="Especificar diretório que contém os arquivos .json")

args = parser.parse_args()
DATA_DIR = args.dir

SIGNIFICANCE_LEVEL = 0.5

# Função que carrega as informações dos projetos (owner, name, created_at date, etc ...)
def getRepData(filePath):

    with open(filePath, 'r', encoding='utf8') as file:
        reader = json.load(file) # Leitor de json
        owner = reader['owner'] #Os atributos podem ser selecionados comoo keys em um dicionário
        repName = reader['name']

        try:
            language = reader['language']
        except(KeyError):
            if os.name == 'nt':
                language = filePath.split('\\')[-2]
            else:
                language = filePath.split('/')[-2]

        cDate = datetime.strptime(reader['created_at'].split('T')[0], '%Y-%m-%d').date()
        wd = [ week['total'] for week in reader['weekly_distribuition'] ]
        lenWD = len(reader['weekly_distribuition'])
        lenFC = len(reader['first_contribuitions'])
        nStars = reader['stars']
        nSubs = reader['subscribers']
        labels = False

        # if reader['has_newcomer_labels']:
        #     try:
        #         if len(reader['weekly_distribuition_before']) > 5 and len(reader['weekly_distribuition_after']) > 5:#Condicional para identificar projetos com dados insuficientes para comparação
        #             labels=True
        #         else:
        #             print(owner,repName)
        #     except(KeyError):
        #         print(owner,repName)
        #         pass

    return (owner, repName, language, cDate, wd, lenWD, lenFC, nStars, nSubs, labels)


# Função que carrega os dados pré e pós a utilização de rótulos para novatos
def getPrePostData(filePath):
    with open(filePath, 'r', encoding='utf8') as file:
        reader = json.load(file)
        dataTreatment, dataControl, label = [], [], ''
        discard = False #Flag utilizada para identificar repositórios cuja label para novato foi detectada nos 6 primeiros meses.
        
        try:
            dataTreatment = reader['weekly_distribuition_after'] 
            dataControl = reader['weekly_distribuition_before']
            cDate = datetime.strptime(reader['created_at'].split('T')[0], '%Y-%m-%d').date()
            labelDate = datetime.strptime(reader['newcomer_labels'][0]['created_at'].split('T')[0], '%Y-%m-%d').date()
            tDelta = labelDate - cDate

            if tDelta.days <= 180:
                discard = True
            label = reader['newcomer_labels'][0]['name'] # Pegando a label para novato mais antiga

        except(KeyError):                            
            print('ERROR: No pre/post data available.') # Caso dê algum problema na leitura dos dados
            print(owner,repName)
            pass
    
    return(label ,dataTreatment, dataControl, discard)


# Função que executa os testes estátisticos em um par de datasets
def getStats(dataTreatment, dataControl): 
   
    if len(dataTreatment) == 0 or len(dataControl) == 0:  #Quando não há dados para serem comparados
        return '' 

    # Usando r2py para executar funções do R em Python
    rTreatment = robjects.IntVector(dataTreatment) # Convertendo para vetores do R
    rControl = robjects.IntVector(dataControl) # Convertendo para vetores do R

    # Delta Cliff test
    rDelta = robjects.r['cliff.delta'] #Executa do teste Delta de Cliff em R resultando no valor Delta e seu tamanho de efeito
    deltaRResult = str(rDelta(rTreatment, rControl))
    deltaValue = 0
    deltaEffsize = ''
   
    # Wilcox test
    rWilcox = robjects.r['wilcox.test'] #Executa do teste MWW em R resultando no valor Delta e seu tamanho de efeito
    wilcoxpValue = 0
    wilcoxRResult = str(rWilcox(rTreatment, rControl, **{'paired': robjects.BoolVector([False])}))

    for line in wilcoxRResult.split('\n'): # Extrai o p-value do output
        if 'p-value' in line:
            wilcoxpValue = float(line.split()[-1])

    for line in deltaRResult.split('\n'): # Extrai o delta e effsize do output
        if 'delta estimate' in line:
            deltaValue = float(line.split()[-2])
            deltaEffsize = line.split()[-1].replace('(','').replace(')','')

    print(deltaValue)
    print(deltaEffsize)
    ### Avalia o resultado do teste definindo se as distribuições são diferentes ou não
    if wilcoxpValue < SIGNIFICANCE_LEVEL: 
        identical = False
    else: 
        identical = True

    ### Descomente para visualizar os dados durante a execução
    print('Delta estimate: {} ({})'.format(deltaValue, deltaEffsize))
    print('(p-value= {:.3E}); Identical population: {}'.format(wilcoxpValue, identical))
    return(deltaValue, deltaEffsize, wilcoxpValue, identical)


#Coleta um resumo das características de um dataset (distribuição) 
def summarize(dataSet, stringFormat=True):

    minimum = min(dataSet)    
    maximum = max(dataSet)
    median = stats.median(dataSet)
    mean = stats.mean(dataSet)
    stdDev = stats.stdev(dataSet)

    if stringFormat:
        return "Min={};Median={:.3f};Mean={:.3f};Max={};stdDev={:.3f}".format(minimum, median, mean, maximum, stdDev)
    else:
        return minimum, median, mean, maximum, stdDev


def generateLanguageSummary(dataSet, outName='languageSummary.csv'):
    languages = {} 

    for repName in dataSet:
        curRep = dataSet[repName]
        lang = curRep['lang']
        nFC = curRep['nFC'] #Number of first contribution
        if lang not in languages:
            languages[lang] = {'nFC':[nFC], 'repos':[repName]}
        else:
            languages[lang]['nFC'].append(nFC)
            languages[lang]['repos'].append(repName)

    with open(outName, 'w') as outFile:
        outFile.write("Lang,Min,Median,Mean,Max,StdDev,sampleSize\n")
        totalSamples = 0
        for lang in languages:
            minimum, median, mean, maximum, stdDev = summarize(languages[lang]['nFC'], stringFormat=False)
            sampleSize = len(languages[lang]['nFC'])
            totalSamples += sampleSize
            outFile.write("{},{},{:.3f},{:.3f},{},{:.3f},{}\n".format(lang, minimum, median, mean, maximum, stdDev, sampleSize))
            outFile.write("Repos({}) -> {}\n".format(lang,languages[lang]['repos']))


################################################################################
################################################################################
################################################################################


# Lista todos os arquivos JSON no diretório
files = [ file for file in glob(os.path.join(DATA_DIR, '*/*.json'))]


# Coleta e armazena todos os dados
dataLabel = {} # Repositórios com rótulo para novato
dataNoLabel = {} # Repositórios sem rótulo para novato
dataAll = {} # Todos repositórios

for file in files:
    owner, repName, language, cDate, wd, nWD, nFC, nStars, nSubs, labels = getRepData(file)
    dataAll[repName] = {'owner':owner, 'lang':language, 'cDate':cDate, 'wd':wd, 'nWD':nWD, 'nFC':nFC, 'stars':nStars, 'subs':nSubs}

    if labels:
        label, dataTreatment, dataControl, invalid = getPrePostData(file)
        dataLabel[repName] = {'owner':owner, 'lang':language, 'cDate':cDate, 'wd':wd, 'nWD':nWD, 'nFC':nFC, 'stars':nStars, 'subs':nSubs, 'label': label, 'treatment':dataTreatment, 'control':dataControl, 'invalid':invalid}
    else:
        dataNoLabel[repName] = {'owner':owner, 'lang':language, 'cDate':cDate, 'wd':wd, 'nWD':nWD, 'nFC':nFC, 'stars':nStars, 'subs':nSubs}

### Cada tipo de teste foi escrito em funções para permitir execução em paralelo

### Executa os testes nos projetos com vs sem label e gera o CSV dos resultados
def generateDataWithVsWithoutLabel(dataTreatment, dataControl, outName='resultWithVSWithoutLabel.csv'):
    vecTreatment = []
    vecControl = []

    for repTreatment in dataTreatment:
        nFC = dataTreatment[repTreatment]['nFC']
        vecTreatment.append(nFC)  

    for repControl in dataControl:
        nFC = dataControl[repControl]['nFC']
        vecControl.append(nFC)

    d_est, eff_size, pvalue, identical = getStats(vecTreatment, vecControl)

    with open(outName, 'w') as outFile:
        outFile.write("[p-value,identical,delta,eff_size, summary(treatment | control)]\n")
        outFile.write("{},{},{},{}, {} | {}\n".format(pvalue, identical, d_est, eff_size, summarize(vecTreatment), summarize(vecControl)))


### Executa os testes nos projetos antes e depois da utilização da label e gera o CSV dos resultados
def generateDataPreVsPostLabel(dataDict, outName='compPrePost.csv'):
    with open(outName, 'w') as outFile:
        outFile.write('[owner/repo, lang, label, wilcoxon_pvalue, identical, eff_size, invalid, summary(treatment | control)]\n')

        for repName in dataDict:
            curRep = dataDict[repName]
            owner, language, label, dataTreatment, dataControl, invalid = itemgetter('owner', 'lang', 'label', 'treatment', 'control', 'invalid')(curRep)
            d_est, eff_size, pvalue, identical = getStats(dataTreatment, dataControl)
            outFile.write("{}/{},{},{},{:.3E},{},{},{},{}, {} | {}\n".format(owner, repName, language.upper(), label, pvalue, identical, d_est, eff_size, invalid, summarize(dataTreatment), summarize(dataControl)))



def MedianComp(dataDict, parameter):

    belowMedian = []
    aboveMedian = []
    sortedDict = { k:v for k, v in sorted(dataDict.items(), key=lambda item: item[1][parameter]) }
    median = len(sortedDict)//2

    for index, repName in enumerate(sortedDict):
        nFC = sortedDict[repName]['nFC']
        if index <= median:
            belowMedian.append(nFC)
        else:
            aboveMedian.append(nFC)

    d_est, eff_size, pvalue, identical =  getStats(aboveMedian, belowMedian)

    return d_est, eff_size, pvalue, identical, summarize(aboveMedian), summarize(belowMedian)

### Executa os testes nos projetos dividindo as distribuições pelas medianas dos atributos stars, weeks, creation_date, subs e gera o CSV dos resultados
def generateDataByMedian(dataDict, params=['cDate', 'nWD', 'stars', 'subs'], outName='resulByMedians.csv'):
    with open(outName, 'w') as outFile:
        for param in params:
            outFile.write("Comparing first contributions using the median of {}\n".format(param))
            d_est, eff_size, pvalue, identical, summary_treatment, summary_control = MedianComp(dataDict, param)
            outFile.write("[p-value,identical,delta,eff_size, summary(treatment | control)]\n")
            outFile.write("{},{},{},{}, {} | {}\n\n".format(pvalue, identical, d_est, eff_size, summary_treatment, summary_control))


### Executa os testes dividindo as distribuições por linguagens e gera o CSV dos resultados
def generateDataCompLanguages(dataDict, outName='resultCompByLang.csv'):
    languages = []
    fCLang = {}

    for repName in dataDict:
        lang = dataDict[repName]['lang']
        nFC = dataDict[repName]['nFC']

        if lang not in languages:
            languages.append(lang)
            fCLang[lang] = [nFC]
        else:
            fCLang[lang].append(nFC)

    comp_lang = languages.copy()

    with open(outName, 'w') as outFile:
        outFile.write("[lang1,lang2,p-value,identical,delta,eff_size, summary(treatment | control)]\n")

        for lang1 in languages:
            data1 = fCLang[lang1]
            comp_lang.remove(lang1)

            for lang2 in comp_lang:
                data2 = fCLang[lang2]
                d_est, eff_size, pvalue, identical = getStats(data1, data2)
                outFile.write("{},{},{},{},{},{}, {} | {}\n".format(lang1, lang2, pvalue, identical, d_est, eff_size, summarize(data1), summarize(data2)))

# Exporta arquivo comparando pre/post newcomer tags para todos os repositórios
p1 = Process(target=generateDataPreVsPostLabel, args=(dataLabel,))

# Exporta arquivo comparando repos com e sem label
p2 = Process(target=generateDataWithVsWithoutLabel, args=(dataLabel, dataNoLabel))

# Exporta comparação por mediana para todos com label
p3 = Process(target=generateDataByMedian, args=(dataLabel,), kwargs={'outName':'resulByMediansWithLabel.csv'})

# Exporta comparação por mediana para todos sem label
p4 = Process(target=generateDataByMedian, args=(dataNoLabel,), kwargs={'outName':'resulByMediansWithoutLabel.csv'})

# Exporta comparação por mediana para todos
p5 = Process(target=generateDataByMedian, args=(dataAll,), kwargs={'outName':'resulByMediansAll.csv'})

# Exporta comparação por linguagem
p6 = Process(target=generateDataCompLanguages, args=(dataAll,))

# Exporta o sumário por linguagem
p7 = Process(target=generateLanguageSummary, args=(dataAll,))

# Para não rodar um dos processos acima basta remove-la da lista 'exec_list'
exec_list = [p7]
#exec_list = [p1, p2, p3, p4, p5, p6, p7]

# Para economizar recurso, utilizar multiproc=False (mais lento)
def main(proc_list, multiproc=True):
    ### Execução paralela, um processo para cada função (mais rápido, utiliza mais memória e processador)
    if multiproc:
        for proc in proc_list:
            proc.start()
        for proc in proc_list:
            proc.join()
    ### Execução sequencial (mais lento, mais leve, utiliza menos recursos)
    else:
        for proc in proc_list:
            proc.start()
            proc.join()

if __name__ == '__main__':
    main(exec_list)
    print("---Execution time: %s seconds ---" % (time.time() - start_time))

#Execução
#./executeTests.py <diretório-dos-json>

#Pré-requisitos 
#Python 3
#Bibliotecas rpy2 e numpy instaladas.