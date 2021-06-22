const YAML = require('yaml');
const { readFileSync } = require('fs');
const { Octokit } = require('@octokit/core');
const { schemeFile, mode, type } = require('./inputs.js');

/**
 * @typedef {import('./@typings/helpers').OctokitResult<'GET /repos/{owner}/{repo}/pulls'>[0]} PR
 * @typedef {import('./@typings/helpers').OctokitResult<'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews'>[0]} Review
 */

const {
    GITHUB_TOKEN,
    GITHUB_SHA,
    GITHUB_REPOSITORY,
    GITHUB_EVENT_PATH,
} = process.env;

const [ owner, repo ] = GITHUB_REPOSITORY.split('/');

const yaml = YAML.parse(readFileSync(schemeFile, 'utf8'));

/** @type {{[x: string]: string[]}} */
const repoReviewers = ['centralized', undefined].includes(type) ? yaml[repo] : type === 'distributed' ? yaml : {};

console.log('Repository reviewers:\n' + YAML.stringify(repoReviewers));

const octokit = new Octokit({ auth: GITHUB_TOKEN });

function getTargetPRFromList(list, sha){
    for(const pr of list) if(pr.head.sha === sha) return pr;
}

async function getTargetPR(){
    const eventData = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
    /** @type {PR} */
    let pr = eventData.pull_request;
    if(!eventData.pull_request){
        const list = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
            owner,
            repo,
            per_page: 100,
        });
        pr = getTargetPRFromList(list.data, GITHUB_SHA) || getTargetPRFromList(list.data, eventData.workflow_run.head_commit.id);
    }
    return pr;
}

/** @arg {PR} pr */
async function merge(pr){
    await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner,
        repo,
        pull_number: pr.number,
        commit_title: `Merge pull request #${pr.number}`,
        sha: pr.head.sha,
    });
    await octokit.request('DELETE /repos/{owner}/{repo}/git/refs/{ref}', {
        owner,
        repo,
        ref: 'heads/' + pr.head.ref,
    });
}

/**
 * @arg {number} pr
 * @arg {string[]} reviewers
 */
async function requestReviewers(pr, reviewers){
    await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
        owner,
        repo,
        pull_number: pr,
        reviewers,
    });
}

/**
 * @arg {string[]} approvals
 * @arg {string[]} reviewers
 */
function getRestReviewers(approvals, reviewers){
    const rest = [];
    for(const reviewer of reviewers){
        if(!approvals.includes(reviewer)) rest.push(reviewer);
    }
    return rest;
}

/**
 * @arg {PR} pr
 * @arg {string[]} reviewers
 * @arg {Review[]} reviews
 * @arg {boolean} single
 */
async function main(pr, reviewers, reviews, single){
    const reviewMap = {};
    // get LAST user reviews
    for(const review of reviews) reviewMap[review.user.login] = review.state;
    console.log('Review map:\n' + YAML.stringify(reviewMap));
    const reviewedBy = Object.keys(reviewMap);
    for(const revBy of reviewedBy){
        if(!reviewers.includes(revBy)) console.warn(`cannot find reviewer ${revBy} in scheme`);
    }
    const approvals = reviewedBy.map(i => reviewMap[i]).filter(v => v === 'APPROVED');
    console.log('Approvals:\n' + YAML.stringify(approvals));
    const rest = getRestReviewers(approvals, reviewers);
    if(!rest.length){
        console.log('There is no rest reviewers. Merging...');
        await merge(pr);
    } else {
        const reviewerList = single ? [ rest[0] ] : rest;
        console.log('There rest reviewers:\n' + YAML.stringify(rest) + '\nRequesting reviews from:\n' + YAML.stringify(reviewerList));
        await requestReviewers(pr.number, reviewerList);
    }
}

(async () => {
    try{
        const pr = await getTargetPR();
        console.log('Target PR:\n' + YAML.stringify(pr));
        const reviewers = repoReviewers[pr.user.login] || repoReviewers['*'];
        console.log('Reviewers:\n' + YAML.stringify(reviewers));
        const reviews = ((await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100,
        })).data || []).filter(v => v.commit_id === pr.head.sha);
        if(!reviews) throw new Error('reviewers for author ' + pr.user.login + ' isn\'t defined. Try to define wildcard rule for any author named with "*"');
        console.log('Reviews:\n' + YAML.stringify(reviews));
        switch(mode){
            case 'single':
            case 'multiple':
            case undefined:
                await main(pr, reviewers, reviews, mode === 'single');
            default:
                throw new Error('mode can be only single or multiple');
        }
    } catch(e){
        console.log('::error::' + e.message);
        process.exit(1);
    }
})()
