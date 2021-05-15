const YAML = require('yaml');
const { readFileSync } = require('fs');
const { Octokit } = require('@octokit/core');
const {
    schemeFile,
} = require('./inputs.js');

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

/** @type {{[x: string]: string[]}} */
const repoReviewers = YAML.parse(readFileSync(schemeFile, 'utf8'))[repo];

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

/**
 * @arg {PR} pr
 * @arg {string[]} reviewers
 * @arg {Review[]} reviews
 */
async function singleMode(pr, reviewers, reviews){
    const lastReview = reviews[reviews.length - 1];
    if(lastReview?.commit_id === pr.head.sha){
        if(lastReview.state === 'APPROVED'){
            const reviewerIdx = reviewers.indexOf(lastReview.user.login);
            if(reviewerIdx === -1){
                console.error('FAIL: CANNOT FIND REVIEWER IN SCHEME. ABORTING...');
                process.exit(1);
            } else {
                const nextReviewer = reviewers[reviewerIdx + 1];
                if(!nextReviewer){
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
                } else {
                    octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
                        owner,
                        repo,
                        pull_number: pr.number,
                        reviewers: [ nextReviewer ],
                    });
                }
            }
        }
    } else {
        octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
            owner,
            repo,
            pull_number: pr.number,
            reviewers: [ reviewers[0] ],
        });
    }
}

(async () => {
    const pr = await getTargetPR();
    const reviewers = repoReviewers[pr.user.login];
    const { data: reviews } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
    });
    await singleMode(pr, reviewers, reviews);
})()
