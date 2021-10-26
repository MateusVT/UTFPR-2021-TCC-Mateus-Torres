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
    description="Gerar statísticas de projetos de SL do GitHub usando funções da linguagem R.")
parser.add_argument('dir', nargs='?',  default='resources', help="Especificar diretório que contém os arquivos .json")

args = parser.parse_args()
DATA_DIR = args.dir

SIGNIFICANCE_LEVEL = 0.5

# Função que carrega as informações dos projetos (owner, name, created_at date, etc ...)
def getRepData(filePath):

    with open(filePath, 'r', encoding='utf8') as file:
        reader = json.load(file) # Leitor de json
        owner = reader['owner'] #Os atributos podem ser selecionados comoo keys em um dicionário
        rep_name = reader['name']
        rep_full_name = reader['nameconcat']

        try:
            language = reader['language']
        except(KeyError):
            if os.name == 'nt':
                language = filePath.split('\\')[-2]
            else:
                language = filePath.split('/')[-2]

        created_at = datetime.strptime(reader['created_at'].split('T')[0], '%Y-%m-%d').date()
        weekly_dist = [ week['total'] for week in reader['weekly_distribuition'] ]
        weekly_dist_len = len(reader['weekly_distribuition'])
        first_contributions_len = len(reader['first_contribuitions'])
        stars_size = reader['stars']
        subs_size = reader['subscribers']
        has_newcomer_labels = reader['has_newcomer_labels']
        enought_data_to_split = False
        newcomer_label = None

        if reader['has_newcomer_labels']:
            newcomer_label = reader['newcomer_labels'][0]['name']
            try:
                if len(reader['weekly_distribuition_before']) >= 1 and len(reader['weekly_distribuition_after']) >= 1:#Condicional para identificar projetos com dados insuficientes nas distribuições para comparação
                    enought_data_to_split = True
                #else:
                    #print(owner,rep_name)
            except(KeyError):
                print("error -:> ", owner,rep_name)
                pass

    return (rep_full_name, owner, rep_name, language, created_at, weekly_dist, weekly_dist_len, first_contributions_len, stars_size, subs_size, enought_data_to_split, has_newcomer_labels, newcomer_label)


# Função que carrega os dados pré e pós a utilização de rótulos para novatos
def getPrePostData(filePath):
    with open(filePath, 'r', encoding='utf8') as file:
        reader = json.load(file)
        data_treatment, data_control, label = [], [], ''
        discard = False #Flag utilizada para identificar repositórios cuja label para novato foi detectada nos 6 primeiros meses.
        
        try:
            data_treatment = reader['weekly_distribuition_after'] 
            data_control = reader['weekly_distribuition_before']
            created_at = datetime.strptime(reader['created_at'].split('T')[0], '%Y-%m-%d').date()
            newcomer_label_created_at = datetime.strptime(reader['newcomer_labels'][0]['created_at'].split('T')[0], '%Y-%m-%d').date()
            t_delta = newcomer_label_created_at - created_at

            if t_delta.days <= 180:# Descarta projetos que cuja label foi registra nos 6 primeiros meses do projeto
                discard = True
            label = reader['newcomer_labels'][0]['name'] # Pegando a label para novato mais antiga

        except(KeyError):                            
            print('ERROR: No pre/post data available: ',owner,rep_name) # Caso dê algum problema na leitura dos dados
            pass
    
    return(label, data_treatment, data_control, discard)


# Função que executa os testes estátisticos em um par de datasets
def getStats(data_treatment, data_control): 
   
    if len(data_treatment) == 0 or len(data_control) == 0:  # Quando não há dados para serem comparados
        return '' 

    # Usando r2py para executar funções do R em Python
    r_treatment = robjects.IntVector(data_treatment) # Convertendo para vetores do R
    r_control = robjects.IntVector(data_control) # Convertendo para vetores do R

    # Delta Cliff test
    r_delta = robjects.r['cliff.delta'] # Executa do teste Delta de Cliff em R resultando no valor Delta e seu tamanho de efeito
    delta_r_result = str(r_delta(r_treatment, r_control))
    delta_value = 0
    delta_effsize = ''
   
    # Wilcox test
    r_wilcox = robjects.r['wilcox.test'] # Executa do teste MWW em R resultando no valor Delta e seu tamanho de efeito
    wilcox_p_value = 0
    wilcox_r_result = str(r_wilcox(r_treatment, r_control, **{'paired': robjects.BoolVector([False])}))

    for line in wilcox_r_result.split('\n'): # Extrai o p-value do output
        if 'p-value' in line:
            wilcox_p_value = float(line.split()[-1])

    for line in delta_r_result.split('\n'): # Extrai o delta e effsize do output
        if 'delta estimate' in line:
            delta_value = float(line.split()[-2])
            delta_effsize = line.split()[-1].replace('(','').replace(')','')

    ### Avalia o resultado do teste definindo se as distribuições são diferentes ou não
    if wilcox_p_value < SIGNIFICANCE_LEVEL: 
        identical = False
    else: 
        identical = True

    ### Descomente para visualizar os dados durante a execução
    #print('Delta estimate: {} ({})'.format(delta_value, delta_effsize))
    #print('(p-value= {:.3E}); Identical population: {}'.format(wilcox_p_value, identical))
    return(delta_value, delta_effsize, wilcox_p_value, identical)


#Coleta um resumo das características de um dataset (distribuição) 
def summarize(dataSet, stringFormat=True):
    minimum = min(dataSet)    
    maximum = max(dataSet)
    median = stats.median(dataSet)
    mean = stats.mean(dataSet)
    std_dev = stats.stdev(dataSet)

    if stringFormat:
        return "Min={};Median={:.3f};Mean={:.3f};Max={};std_dev={:.3f}".format(minimum, median, mean, maximum, std_dev)
    else:
        return minimum, median, mean, maximum, std_dev


def generateLanguageSummary(dataSet, outName='languageSummary.csv'):
    languages = {} 

    for rep_name in dataSet:
        curRep = dataSet[rep_name]
        lang = curRep['lang']
        number_first_contr = curRep['number_first_contr'] #Number of first contribution
        if lang not in languages:
            languages[lang] = {'number_first_contr':[number_first_contr], 'repos':[rep_name]}
        else:
            languages[lang]['number_first_contr'].append(number_first_contr)
            languages[lang]['repos'].append(rep_name)

    with open(outName, 'w') as outFile:
        outFile.write("Lang,Min,Median,Mean,Max,StdDev,Sample Size\n")
        totalSamples = 0
        for lang in languages:
            minimum, median, mean, maximum, std_dev = summarize(languages[lang]['number_first_contr'], stringFormat=False)
            sample_size = len(languages[lang]['number_first_contr'])
            totalSamples += sample_size
            outFile.write("{},{},{:.3f},{:.3f},{},{:.3f},{}\n".format(lang, minimum, median, mean, maximum, std_dev, sample_size))
            outFile.write("Repos({}) -> {}\n".format(lang,languages[lang]['repos']))


################################################################################
################################################################################
################################################################################


# Lista todos os arquivos JSON no diretório
files = [ file for file in glob(os.path.join(DATA_DIR, '*/*.json'))]


# Coleta e armazena todos os dados
data_with_label = {} # Repositórios com rótulo para novato
data_without_label = {} # Repositórios sem rótulo para novato
data_all = {} # Todos repositórios

for file in files:
    rep_full_name, owner, rep_name, language, created_at, weekly_dist, number_weekly_dist, number_first_contr, stars_size, subs_size, enought_data_to_split, has_newcomer_labels, newcomer_label = getRepData(file)
    data_all[rep_full_name] = {'owner':owner, 'lang':language, 'created_at':created_at, 'weekly_dist':weekly_dist, 'number_weekly_dist':number_weekly_dist, 'number_first_contr':number_first_contr, 'stars':stars_size, 'subs':subs_size}

    if has_newcomer_labels:
        if(enought_data_to_split):
            label, data_treatment, data_control, invalid = getPrePostData(file)
        else:
             label, data_treatment, data_control, invalid = (newcomer_label, [], [], True)
        data_with_label[rep_full_name] = {'owner':owner, 'lang':language, 'created_at':created_at, 'weekly_dist':weekly_dist, 'number_weekly_dist':number_weekly_dist, 'number_first_contr':number_first_contr, 'stars':stars_size, 'subs':subs_size, 'label': label, 'treatment':data_treatment, 'control':data_control, 'invalid':invalid}
    else:
        data_without_label[rep_full_name] = {'owner':owner, 'lang':language, 'created_at':created_at, 'weekly_dist':weekly_dist, 'number_weekly_dist':number_weekly_dist, 'number_first_contr':number_first_contr, 'stars':stars_size, 'subs':subs_size}

### Cada tipo de teste foi escrito em funções para permitir execução em paralelo

### Executa os testes nos projetos com vs sem label e gera o CSV dos resultados
def generateDataWithVsWithoutLabel(data_treatment, data_control, outName='resultWithVSWithoutLabel.csv'):
    vec_treatment = []
    vec_control = []

    for repTreatment in data_treatment:
        number_first_contr = data_treatment[repTreatment]['number_first_contr']
        vec_treatment.append(number_first_contr)  

    for repControl in data_control:
        number_first_contr = data_control[repControl]['number_first_contr']
        vec_control.append(number_first_contr)

    d_est, eff_size, pvalue, identical = getStats(vec_treatment, vec_control)

    with open(outName, 'w') as outFile:
        outFile.write("p-value,identical,delta,eff_size,summary(treatment),treatment_size,summary(control),control_size\n")
        outFile.write("{},{},{},{},{},{},{},{}\n".format(pvalue, identical, d_est, eff_size, summarize(vec_treatment), len(vec_treatment), summarize(vec_control), len(vec_control)))
        outFile.write("treatment={}\n".format(vec_treatment))
        outFile.write("control={}".format(vec_control))


### Executa os testes nos projetos antes e depois da utilização da label e gera o CSV dos resultados
def generateDataPreVsPostLabel(dataDict, outName='compPrePost.csv'):
    with open(outName, 'w') as outFile:
        outFile.write('owner/repo,lang,label,wilcoxon_pvalue,identical,delta,eff_size,invalid,summary_treatment,summary_control\n')

        for rep_name in dataDict:
            curRep = dataDict[rep_name]
            owner, language, label, data_treatment, data_control, invalid = itemgetter('owner', 'lang', 'label', 'treatment', 'control', 'invalid')(curRep)

            if invalid:
                d_est, eff_size, pvalue, identical, summary_treatment, summary_control = ('', '', '', '', '', '')
                outFile.write("{},{},{},{},{},{},{},{},{},{}\n".format(rep_name, language.upper(), label, pvalue, identical, d_est, eff_size, invalid, summary_treatment, summary_control))
            else:
                d_est, eff_size, pvalue, identical = getStats(data_treatment, data_control) 
                summary_treatment, summary_control = summarize(data_treatment), summarize(data_control)
                outFile.write("{},{},{},{:.3E},{},{},{},{},{},{}\n".format(rep_name, language.upper(), label, pvalue, identical, d_est, eff_size, invalid, summary_treatment, summary_control))



def MedianComp(dataDict, parameter):

    belowMedian = []
    aboveMedian = []
    sortedDict = { k:v for k, v in sorted(dataDict.items(), key=lambda item: item[1][parameter]) }
    median = len(sortedDict)//2

    for index, rep_name in enumerate(sortedDict):
        number_first_contr = sortedDict[rep_name]['number_first_contr']
        if index <= median:
            belowMedian.append(number_first_contr)
        else:
            aboveMedian.append(number_first_contr)

    d_est, eff_size, pvalue, identical =  getStats(aboveMedian, belowMedian)

    return d_est, eff_size, pvalue, identical, summarize(aboveMedian), summarize(belowMedian)

### Executa os testes nos projetos dividindo as distribuições pelas medianas dos atributos stars, weeks, creation_date, subs e gera o CSV dos resultados
def generateDataByMedian(dataDict, params=['created_at', 'number_weekly_dist', 'stars', 'subs'], outName='resultByMedians.csv'):
    with open(outName, 'w') as outFile:
        for param in params:
            outFile.write("Comparing first contributions using the median of {}\n".format(param))
            d_est, eff_size, pvalue, identical, summary_treatment, summary_control = MedianComp(dataDict, param)
            outFile.write("p-value,identical,delta,eff_size,summary_treatment,summary_control\n")
            outFile.write("{},{},{},{},{},{}\n\n".format(pvalue, identical, d_est, eff_size, summary_treatment, summary_control))


### Executa os testes dividindo as distribuições por linguagens e gera o CSV dos resultados
def generateDataCompLanguages(dataDict, outName='resultCompByLang.csv'):
    languages = []
    fCLang = {}

    for rep_name in dataDict:
        lang = dataDict[rep_name]['lang']
        number_first_contr = dataDict[rep_name]['number_first_contr']

        if lang not in languages:
            languages.append(lang)
            fCLang[lang] = [number_first_contr]
        else:
            fCLang[lang].append(number_first_contr)

    comp_lang = languages.copy()

    with open(outName, 'w') as outFile:
        outFile.write("lang1,lang2,p-value,identical,delta,eff_size,summary_treatment,summary_control\n")

        for lang1 in languages:
            data1 = fCLang[lang1]
            comp_lang.remove(lang1)

            for lang2 in comp_lang:
                data2 = fCLang[lang2]
                d_est, eff_size, pvalue, identical = getStats(data1, data2)
                outFile.write("{},{},{},{},{},{},{},{}\n".format(lang1, lang2, pvalue, identical, d_est, eff_size, summarize(data1), summarize(data2)))

# Exporta arquivo comparando pre/post newcomer tags para todos os repositórios
p1 = Process(target=generateDataPreVsPostLabel, args=(data_with_label,))

# Exporta arquivo comparando repos com e sem label
p2 = Process(target=generateDataWithVsWithoutLabel, args=(data_with_label, data_without_label))

# Exporta comparação por mediana para todos com label
p3 = Process(target=generateDataByMedian, args=(data_with_label,), kwargs={'outName':'resultByMediansWithLabel.csv'})

# Exporta comparação por mediana para todos sem label
p4 = Process(target=generateDataByMedian, args=(data_without_label,), kwargs={'outName':'resultByMediansWithoutLabel.csv'})

# Exporta comparação por mediana para todos
p5 = Process(target=generateDataByMedian, args=(data_all,), kwargs={'outName':'resultByMediansAll.csv'})

# Exporta comparação por linguagem
p6 = Process(target=generateDataCompLanguages, args=(data_all,))

# Exporta o sumário por linguagem
p7 = Process(target=generateLanguageSummary, args=(data_all,))

# Para não rodar um dos processos acima basta remove-la da lista 'exec_list'
exec_list = [p2]
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
    print("--- Starting execution! ---")
    main(exec_list)
    print("---Execution time: %s seconds ---" % (time.time() - start_time))

#Execução
#./executeTests.py <diretório-dos-json>

#Pré-requisitos 
#Python 3
#Bibliotecas rpy2 e numpy instaladas.
#Instalar pacotes stats e effsize do R