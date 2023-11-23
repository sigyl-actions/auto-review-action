const YAML = require('yaml');
const { readFileSync } = require('fs');
const { Octokit } = require('@octokit/core');
const { schemeFile, mode, type, token, ref } = require('./inputs.js');

/**
 * @typedef {import('./@typings/helpers').OctokitResult<'GET /repos/{owner}/{repo}/pulls/{pull_number}'>} PR
 * @typedef {import('./@typings/helpers').OctokitResult<'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews'>[0]} Review
 */

const {
    GITHUB_REPOSITORY,
    GITHUB_REF,
} = process.env;

const [ owner, repo ] = GITHUB_REPOSITORY.split('/');

const yaml = YAML.parse(readFileSync(schemeFile, 'utf8'));

/** @type {{[x: string]: string[]}} */
const repoReviewers = [ 'centralized', undefined ].includes(type) ? yaml[repo] : type === 'distributed' ? yaml : (() => {
    throw new Error('type can be only centralized or distributed');
})();

console.log('Repository reviewers:\n' + YAML.stringify(repoReviewers));

const octokit = new Octokit({ auth: token });

async function getTargetPR(){
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: (ref || GITHUB_REF).slice(10, -6),
    });
    return data;
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
 * @arg {string[]} reviews
 * @arg {string[]} reviewers
 */
function getRestReviewers(reviews, reviewers){
    const rest = [];
    for(const reviewer of reviewers){
        if(!reviews.includes(reviewer)) rest.push(reviewer);
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
    const approvals = reviewedBy.filter(i => reviewMap[i] === 'APPROVED');
    console.log('Approvals:\n' + YAML.stringify(approvals));
    const rest = getRestReviewers(reviewedBy, reviewers);
    const restApprovals = getRestReviewers(approvals, reviewers);
    if(!rest.length){
        if(!restApprovals.length){
            console.log('There are no rest reviewers. Merging...');
            await merge(pr);
        } else {
            const last = restApprovals.pop();
            console.log('There are no rest reviewers but PR isn\'t approved by ' + [restApprovals.join(', '), last].filter(v => v).join(' and ') + ' yet');
        }
    } else {
        const reviewerList = single ? [ rest[0] ] : rest;
        console.log('There are rest reviewers:\n' + YAML.stringify(rest) + '\nRequesting reviews from:\n' + YAML.stringify(reviewerList));
        await requestReviewers(pr.number, reviewerList);
    }
}

(async () => {
    try{
        console.log('i did get here');
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
        if([ 'single', 'multiple', undefined ].includes(mode)) await main(pr, reviewers, reviews, mode === 'single');
        else throw new Error('mode can be only single or multiple');
    } catch(e){
        console.log('::error::' + e.message);
        process.exit(1);
    }
})()
