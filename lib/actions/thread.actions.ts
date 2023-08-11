'use server';

import { revalidatePath } from 'next/cache';
import Thread from '../models/thread.model';
import User from '../models/user.model';
import { connectToDB } from '../mongoose';

interface Params {
    text: string;
    author: string;
    communityId: string | null;
    path: string;
}

export async function createThread({ text, author, communityId, path }: Params) {
    try {
        connectToDB();
        const createdThread = await Thread.create({
            text,
            author,
            community: null,
        });

        //Update user model

        await User.findByIdAndUpdate(author, {
            $push: { threads: createdThread._id },
        });

        revalidatePath(path);
    } catch (error: any) {
        throw new Error(`Fail to create new Thread: ${error.message}`);
    }
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
    connectToDB();

    //Calculate the number of posts to skip
    const skipAmount = (pageNumber - 1) * pageSize;

    // Fetch the posts that have no parent( top-level threads)
    const postsQuery = Thread.find({ parentId: { $in: [null, undefined] } })
        .sort({ createAt: 'desc' })
        .skip(skipAmount)
        .limit(pageSize)
        .populate({ path: 'author', model: User })
        .populate({
            path: 'children',
            populate: {
                path: 'author',
                model: User,
                select: '_id name parentId image',
            },
        });

    const totalPostCount = await Thread.countDocuments({ parentId: { $in: [null, undefined] } });

    const posts = await postsQuery.exec();

    const isNext = totalPostCount > skipAmount + posts.length;

    return { posts, isNext };
}

export async function fetchThreadById(id: string) {
    connectToDB();
    try {
        const thread = await Thread.findById(id)
            .populate({
                path: 'author',
                model: User,
                select: '_id id namme image',
            })
            .populate({
                path: 'children',
                populate: [
                    {
                        path: 'author',
                        model: User,
                        select: '_id id name parentId image',
                    },
                    {
                        path: 'children',
                        model: Thread,
                        populate: {
                            path: 'author',
                            model: User,
                            select: '_id id name parentId image',
                        },
                    },
                ],
            })
            .exec();

        return thread;
    } catch (error: any) {
        throw new Error(`Erro fetching thread: ${error.message}`);
    }
}

export async function addCommentToThread(threadId: string, commentText: string, userId: string, path: string) {
    connectToDB();
    try {
        //Find the original thread by its Id
        const originalThread = await Thread.findById(threadId);

        if (!originalThread) {
            throw new Error('Thread not found');
        }

        //Create new Thread
        const commentThread = new Thread({
            text: commentText,
            author: userId,
            parentId: threadId,
        });

        //Save the new Thread
        const savedCommentThread = await commentThread.save();

        //Update the original thread to include the new comment
        originalThread.children.push(savedCommentThread._id);

        //Save the original thread
        await originalThread.save();

        revalidatePath(path);
    } catch (error: any) {
        throw new Error(`Error adding comment to thread: ${error.message}`);
    }
}

export async function fetchUserPosts(userId: string) {
    try {
        connectToDB();

        //Find all threads authored by user with the given userId
        const threads = await User.findOne({ id: userId }).populate({
            path: 'threads',
            model: Thread,
            populate: {
                path: 'children',
                model: Thread,
                populate: {
                    path: 'author',
                    model: User,
                    select: 'name image id',
                },
            },
        });
        return threads;
    } catch (error: any) {
        throw new Error(`Error fetching User Posts: ${error.message}`);
    }
}
