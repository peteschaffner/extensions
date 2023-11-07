import { Action, ActionPanel, Icon, List, Color, confirmAlert, showToast, Toast } from "@raycast/api";
import { MutatePromise } from "@raycast/utils";
import { oauthClient } from "../api/oauth";
import { format } from "date-fns";
import removeMarkdown from "remove-markdown";
import { getUserIcon } from "../helpers/users";
import { isLinearInstalled } from "../helpers/isLinearInstalled";
import { getErrorMessage } from "../helpers/errors";
import { getLinearClient } from "../helpers/withLinearClient";
import IssueCommentForm from "./IssueCommentForm";
import { CommentResult, IssueResult } from "../api/getIssues";
import { User } from "@linear/sdk";

import fs from 'fs';
import https from 'https';
import path from 'path';
import url from 'url';
import { useState, useEffect } from "react";

async function getAuthToken(): Promise<string> {
	const existingTokens = await oauthClient.getTokens();
	return existingTokens!.accessToken;
}

type IssueCommentProps = {
	key: string;
	comment: CommentResult;
	issue: IssueResult;
	mutateComments: MutatePromise<CommentResult[] | undefined, CommentResult[] | undefined, any>;
	me: User | undefined;
};

export default function IssueComment({ comment, issue, mutateComments, me }: IssueCommentProps) {
	const { linearClient } = getLinearClient();
	const createdAt = new Date(comment.createdAt);
	const [markdown, setMarkdown] = useState("");
	// const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(true);

	async function deleteComment(commentId: string) {
		if (
			await confirmAlert({
				title: "Delete Comment",
				message: "Are you sure you want to delete this comment?",
				icon: { source: Icon.Trash, tintColor: Color.Red },
			})
		) {
			try {
				await showToast({ style: Toast.Style.Animated, title: "Deleting comment" });

				await mutateComments(linearClient.deleteComment(commentId), {
					optimisticUpdate(data) {
						if (!data) {
							return data;
						}
						return data?.filter((x) => x.id !== commentId);
					},
				});

				await showToast({ style: Toast.Style.Success, title: "Deleted comment" });
			} catch (error) {
				showToast({
					style: Toast.Style.Failure,
					title: "Failed to delete comment",
					message: getErrorMessage(error),
				});
			}
		}
	}

	useEffect(() => {
		let origMarkdown = comment.body;

		const urlRegex = /!\[([^\]]*)]\((https:\/\/uploads\.linear\.app\/[^\s]+)\)/g;
		const fetchImage = async (fullMatch: string, imageName: string, urlString: string): Promise<[string, string]> => {
			const parsedUrl = new url.URL(urlString);
			const pathComponents = parsedUrl.pathname.split("/");
			imageName = pathComponents[pathComponents.length - 1] + ".png";

			const outputPath = path.resolve("/tmp", `${imageName}`);
			const authToken = await getAuthToken();
			const options = {
				hostname: parsedUrl.hostname,
				path: parsedUrl.pathname,
				headers: {
					'Authorization': `Bearer ${authToken}`,
				},
			};

			return new Promise((resolve, reject) => {
				https.get(options, (res) => {
					const writer = fs.createWriteStream(outputPath);
					res.pipe(writer);

					writer.on('finish', () => resolve([fullMatch, `![${imageName}](file://${outputPath})`]));
					writer.on('error', reject);
				}).on('error', reject);
			});
		};

		const downloadAllImages = async () => {
			let markdown = origMarkdown;
			const matches = [...origMarkdown.matchAll(urlRegex)];

			for (let match of matches) {
				const [fullMatch, imageName, urlString] = match;

				const [oldText, newText] = await fetchImage(fullMatch, imageName, urlString);
				markdown = markdown.replace(oldText, newText);
			}

			setMarkdown(markdown);
			// setIsLoadingMarkdown(false);
		};

		downloadAllImages().catch((err) => console.error(`Error fetching images: ${err}`));
	}, []);

	return (
		<List.Item
			key={comment.id}
			title={comment.user.displayName}
			subtitle={comment.body}
			icon={getUserIcon(comment.user)}
			keywords={removeMarkdown(comment.body).replace(/\n/g, " ").split(" ")}
			accessories={[
				{
					date: createdAt,
					tooltip: `Created: ${format(createdAt, "EEEE d MMMM yyyy 'at' HH:mm")}`,
				},
			]}
			detail={<List.Item.Detail markdown={markdown} />}
			actions={
				<ActionPanel>
					{isLinearInstalled ? (
						<Action.Open
							title="Open Comment in Linear"
							icon="linear.png"
							target={comment.url}
							application="Linear"
						/>
					) : (
						<Action.OpenInBrowser title="Open Comment in Browser" url={comment.url} />
					)}

					{me?.id === comment.user.id ? (
						<ActionPanel.Section>
							<Action.Push
								title="Edit Comment"
								icon={Icon.Pencil}
								shortcut={{ modifiers: ["cmd"], key: "e" }}
								target={<IssueCommentForm issue={issue} comment={comment} mutateComments={mutateComments} />}
							/>

							<Action
								title="Delete Comment"
								icon={Icon.Trash}
								style={Action.Style.Destructive}
								shortcut={{ modifiers: ["ctrl"], key: "x" }}
								onAction={() => deleteComment(comment.id)}
							/>
						</ActionPanel.Section>
					) : null}

					<ActionPanel.Section>
						<Action.Push
							title="Add Comment"
							icon={Icon.Plus}
							shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
							target={<IssueCommentForm issue={issue} mutateComments={mutateComments} />}
						/>
					</ActionPanel.Section>

					<ActionPanel.Section>
						<Action.CopyToClipboard
							icon={Icon.Clipboard}
							content={comment.url}
							title="Copy Comment URL"
							shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
						/>

						<Action.CopyToClipboard
							icon={Icon.Clipboard}
							content={markdown}
							title="Copy Comment"
							shortcut={{ modifiers: ["cmd", "shift"], key: "'" }}
						/>
					</ActionPanel.Section>

					<ActionPanel.Section>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							shortcut={{ modifiers: ["cmd"], key: "r" }}
							onAction={mutateComments}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
