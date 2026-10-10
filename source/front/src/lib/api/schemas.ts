/**
 * API と取り交わす型。手で書かず、archieves-api の OpenAPI から生成した
 * openapi.d.ts に名前を付け直すだけにする(手書きの写しは API とずれるため)。
 * API を変えたら source/back で `.venv/bin/python -m tools.dump_openapi`、ここで `npm run types`。
 */
import type { components } from './openapi';

type Schemas = components['schemas'];

export type CommentWrite = Schemas['CommentWrite'];
export type EndCommentRead = Schemas['EndCommentRead'];
export type EndCreate = Schemas['EndCreate'];
export type EndRead = Schemas['EndRead'];
export type EndScoreSummary = Schemas['EndScoreSummary'];
export type EndUpdate = Schemas['EndUpdate'];
export type AdminFeedbackRead = Schemas['AdminFeedbackRead'];
export type AnnouncementRead = Schemas['AnnouncementRead'];
export type BowType = Schemas['BowType'];
export type FeedbackCreate = Schemas['FeedbackCreate'];
export type FeedbackRead = Schemas['FeedbackRead'];
export type FeedbackReply = Schemas['FeedbackReply'];
export type GameCommentRead = Schemas['GameCommentRead'];
export type GameComments = Schemas['GameComments'];
export type GameCreate = Schemas['GameCreate'];
export type GameRead = Schemas['GameRead'];
export type GameScoreSummary = Schemas['GameScoreSummary'];
export type GameUpdate = Schemas['GameUpdate'];
export type ImportResult = Schemas['ImportResult'];
export type ImportSource = Schemas['ImportSource'];
export type OrganizationCreate = Schemas['OrganizationCreate'];
export type OrganizationRead = Schemas['OrganizationRead'];
export type OrganizationSummary = Schemas['OrganizationSummary'];
export type PointCreate = Schemas['PointCreate'];
export type PointRead = Schemas['PointRead'];
export type PointUpdate = Schemas['PointUpdate'];
export type RoundCommentRead = Schemas['RoundCommentRead'];
export type RoundCreate = Schemas['RoundCreate'];
export type RoundRead = Schemas['RoundRead'];
export type RoundScoreSummary = Schemas['RoundScoreSummary'];
export type RankingMetric = Schemas['RankingMetric'];
export type RoundUpdate = Schemas['RoundUpdate'];
export type ScoreStatistics = Schemas['ScoreStatistics'];
export type GameKindOptions = Schemas['GameKindOptions'];
export type UserCreate = Schemas['UserCreate'];
export type MeRead = Schemas['MeRead'];
export type UserProfile = Schemas['UserProfile'];
export type UserRanking = Schemas['UserRanking'];
export type UserRead = Schemas['UserRead'];
export type UserUpdate = Schemas['UserUpdate'];
